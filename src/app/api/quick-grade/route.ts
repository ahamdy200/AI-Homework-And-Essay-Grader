import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createGeminiClient,
  createInteractionWithFallback,
  formatGeminiError,
  MissingApiKeyError,
} from "@/lib/gemini";

const QuickGradeRequestSchema = z.object({
  /** Answer key: array of { questionNumber, type, correctAnswer } */
  answerKey: z
    .array(
      z.object({
        questionNumber: z.number().int().min(1).max(25),
        type: z.enum(["mcq", "essay"]),
        correctAnswer: z.string().min(1),
        points: z.number().positive().default(1),
      })
    )
    .min(1)
    .max(25),
  /** Optional student name */
  studentName: z.string().optional().default("Student"),
});

const QUICK_GRADE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcribedText: {
      type: "string",
      description:
        "Verbatim transcription of the student's handwritten or typed answers from the uploaded image(s). Preserve original spelling, punctuation, and line breaks.",
    },
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          studentAnswer: {
            type: "string",
            description:
              "The student's answer as transcribed from the image. For MCQs this is the letter choice; for essays this is the full text.",
          },
          status: {
            type: "string",
            enum: ["correct", "incorrect", "partial", "missing"],
          },
          pointsEarned: { type: "number" },
          maxPoints: { type: "number" },
          explanation: {
            type: "string",
            description:
              "Brief explanation of why the answer is correct, incorrect, or partial.",
          },
        },
        required: [
          "questionNumber",
          "studentAnswer",
          "status",
          "pointsEarned",
          "maxPoints",
          "explanation",
        ],
      },
    },
    totalScore: { type: "number" },
    maxScore: { type: "number" },
    percentage: { type: "number" },
    summaryFeedback: {
      type: "string",
      description:
        "2-3 sentence constructive summary for the student.",
    },
  },
  required: [
    "transcribedText",
    "results",
    "totalScore",
    "maxScore",
    "percentage",
    "summaryFeedback",
  ],
};

export async function POST(req: NextRequest) {
  try {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with image file(s)." },
        { status: 400 }
      );
    }

    const formData = await req.formData();

    // Parse answer key JSON
    const answerKeyRaw = formData.get("answerKey");
    if (typeof answerKeyRaw !== "string") {
      return NextResponse.json(
        { error: "Missing answerKey field." },
        { status: 400 }
      );
    }

    let parsed: z.infer<typeof QuickGradeRequestSchema>;
    try {
      const json = JSON.parse(answerKeyRaw);
      parsed = QuickGradeRequestSchema.parse(json);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof z.ZodError
              ? `Invalid answer key: ${e.issues.map((i) => i.message).join(", ")}`
              : "Invalid answerKey JSON.",
        },
        { status: 400 }
      );
    }

    // Collect image files
    const imageFiles = formData.getAll("images");
    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: "At least one homework image is required." },
        { status: 400 }
      );
    }

    const ALLOWED_TYPES = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ]);

    const imageBlocks: Array<{
      type: "image" | "document";
      data: string;
      mime_type: string;
      resolution?: "high";
    }> = [];

    for (const file of imageFiles) {
      if (!(file instanceof File)) continue;
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported file type "${file.type}". Use PNG, JPG, WEBP, HEIC, or PDF.`,
          },
          { status: 400 }
        );
      }
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the 20 MB limit.` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      if (file.type === "application/pdf") {
        imageBlocks.push({
          type: "document",
          data: base64,
          mime_type: "application/pdf",
        });
      } else {
        imageBlocks.push({
          type: "image",
          data: base64,
          mime_type: file.type,
          resolution: "high",
        });
      }
    }

    // Build answer key text for the prompt
    const keyLines = parsed.answerKey.map((q) => {
      if (q.type === "mcq") {
        return `Q${q.questionNumber}: ${q.correctAnswer.toUpperCase()} (${q.points} pt${q.points === 1 ? "" : "s"}, MCQ)`;
      }
      return `Q${q.questionNumber}: Essay — Model answer: "${q.correctAnswer}" (${q.points} pts)`;
    });

    const totalMaxPoints = parsed.answerKey.reduce((s, q) => s + q.points, 0);

    const systemInstruction = [
      "You are an experienced teacher auto-grading a student homework assignment.",
      "CRITICAL RULES:",
      "1. Transcribe the student's handwritten or typed answers from the uploaded image(s) verbatim into `transcribedText`, preserving spelling errors and line breaks.",
      "2. For each MCQ question, compare the student's letter choice (case-insensitive) against the answer key. Award full points for a match, 0 for wrong or missing.",
      "3. For essay questions, evaluate the student's answer against the model answer. Award partial credit based on content accuracy, completeness, and writing quality.",
      "4. Return one result entry per question in the answer key, in order.",
      "5. Calculate totalScore, maxScore, and percentage accurately.",
      "6. If a question is missing or the student left it blank, mark it as 'missing' with 0 points.",
    ].join("\n");

    const userContent = [
      { type: "text" as const, text: `ANSWER KEY (${parsed.answerKey.length} questions, ${totalMaxPoints} total points):\n${keyLines.join("\n")}` },
      { type: "text" as const, text: "STUDENT HOMEWORK IMAGE(S) — Transcribe and grade each answer against the key above:" },
      ...imageBlocks,
    ];

    const apiKeyOverride = req.headers.get("x-gemini-api-key");
    const ai = createGeminiClient(apiKeyOverride);

    const { interaction, modelUsed } = await createInteractionWithFallback(
      ai,
      (model, ctx) => ({
        model,
        system_instruction: systemInstruction,
        generation_config: {
          thinking_level: ctx?.downgradedAfterTimeout ? "low" : "medium",
        },
        input: [
          {
            type: "user_input",
            content: userContent,
          },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: QUICK_GRADE_RESPONSE_SCHEMA,
        },
      }),
      { timeoutMs: 45000, totalBudgetMs: 95000 }
    );

    const rawText = interaction.output_text;
    if (!rawText) {
      return NextResponse.json(
        { error: "Gemini returned an empty response. Please retry." },
        { status: 502 }
      );
    }

    let result: unknown;
    try {
      result = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned malformed JSON. Please retry." },
        { status: 502 }
      );
    }

    return NextResponse.json({ result, model: modelUsed });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      const formatted = formatGeminiError(err);
      return NextResponse.json(
        { error: formatted.message },
        { status: formatted.httpStatus }
      );
    }

    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.httpStatus }
    );
  }
}
