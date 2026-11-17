import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_MODEL,
  GeminiGradingOutputSchema,
  type AnnotationItem,
  type CriterionScore,
  type GeminiGradingOutput,
  type GradingTone,
  type QuestionResult,
  type RubricCriterion,
  type Submission,
  type ThinkingLevel,
} from "./types";
import {
  applyMcqResultsToCriteria,
  parseAnswerKeyText,
  reconcileQuestionResults,
} from "./mcq";
import {
  calculateLetterGrade,
  clampScore,
  computeCriterionTotals,
  countWords,
} from "./scoring";
import type { ParsedMediaFile } from "./uploads";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "Gemini API key is not configured. Add GEMINI_API_KEY to .env.local or enter a session key in Settings."
    );
    this.name = "MissingApiKeyError";
  }
}

export interface FormattedGeminiError {
  httpStatus: number;
  message: string;
}

interface ParsedUpstreamError {
  code?: number;
  status?: string;
  message?: string;
  reason?: string;
}

function parseUpstreamErrorBody(body: unknown): ParsedUpstreamError {
  if (typeof body !== "string" || !body.trim()) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(body);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!entry || typeof entry !== "object") {
      return { message: body.trim() };
    }
    const record = entry as Record<string, unknown>;
    const errorObj =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : record;

    const details = Array.isArray(errorObj.details) ? errorObj.details : [];
    const reasonEntry = details.find(
      (d) =>
        d &&
        typeof d === "object" &&
        typeof (d as Record<string, unknown>).reason === "string"
    ) as Record<string, unknown> | undefined;

    return {
      code: typeof errorObj.code === "number" ? errorObj.code : undefined,
      status:
        typeof errorObj.status === "string" ? errorObj.status : undefined,
      message:
        typeof errorObj.message === "string"
          ? errorObj.message.trim()
          : undefined,
      reason:
        typeof reasonEntry?.reason === "string"
          ? reasonEntry.reason
          : undefined,
    };
  } catch {
    return { message: body.trim() };
  }
}

/**
 * Extracts a clean HTTP status and actionable teacher-facing message from
 * `@google/genai` SDK or Interactions API errors.
 */
export function formatGeminiError(
  err: unknown,
  fallbackMessage = "Gemini API request failed."
): FormattedGeminiError {
  if (err instanceof MissingApiKeyError) {
    return { httpStatus: 400, message: err.message };
  }

  const record =
    err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const upstream = parseUpstreamErrorBody(record?.body);

  const rawStatus =
    typeof record?.statusCode === "number"
      ? record.statusCode
      : typeof record?.status === "number"
        ? record.status
        : upstream.code;

  const errMessage =
    err instanceof Error && !err.message.includes('"httpMeta"')
      ? err.message.trim()
      : "";
  const detail = upstream.message || errMessage;

  if (rawStatus === 402 || /prepayment credits/i.test(detail)) {
    return {
      httpStatus: 402,
      message: `${detail || "Prepayment credits depleted."} Paid Tier projects with $0 credits do not auto-downgrade to the Free Tier—create a new project without billing in Google AI Studio or disable billing on the project, then use a Free Tier API key.`,
    };
  }

  if (
    rawStatus === 401 ||
    upstream.status === "UNAUTHENTICATED" ||
    /api key not valid/i.test(detail)
  ) {
    return {
      httpStatus: 401,
      message: `${detail || "API key not valid."} Generate an active API key in a Free Tier project at aistudio.google.com/apikey and enter it in Settings or .env.local.`,
    };
  }

  if (rawStatus === 403 || upstream.status === "PERMISSION_DENIED") {
    if (/leaked/i.test(detail)) {
      return {
        httpStatus: 403,
        message: `${detail} Generate a new API key at aistudio.google.com/apikey.`,
      };
    }
    return {
      httpStatus: 403,
      message:
        detail ||
        "Permission denied by Gemini API. Verify that the project and region are enabled for the Free Tier.",
    };
  }

  if (rawStatus === 429 || upstream.status === "RESOURCE_EXHAUSTED") {
    return {
      httpStatus: 429,
      message: `${detail || "Free Tier rate limit reached."} Please wait 30–60 seconds before retrying, or view your Free Tier RPM/RPD limits in Google AI Studio.`,
    };
  }

  if (
    rawStatus === 503 ||
    upstream.status === "UNAVAILABLE" ||
    /high demand|overloaded/i.test(detail)
  ) {
    return {
      httpStatus: 503,
      message: `${detail || "Gemini models are temporarily experiencing high demand."} Automatic fallback models were also busy—please wait a few seconds and click Grade again.`,
    };
  }

  const httpStatus =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;

  return {
    httpStatus,
    message: detail || fallbackMessage,
  };
}

export const GEMINI_FALLBACK_MODELS: readonly string[] = [
  GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

/**
 * Identifies temporary capacity/availability spikes (e.g. 503 UNAVAILABLE "high demand")
 * where retrying or falling back to a sibling current model is safe.
 */
export function isTransientCapacityError(err: unknown): boolean {
  const formatted = formatGeminiError(err);
  if (
    formatted.httpStatus === 500 ||
    formatted.httpStatus === 502 ||
    formatted.httpStatus === 503 ||
    formatted.httpStatus === 504
  ) {
    // Only treat 500s from upstream capacity/network issues as transient, not MissingApiKeyError (400)
    if (err instanceof MissingApiKeyError) return false;
    return true;
  }
  return /high demand|overloaded|temporarily unavailable|unavailable/i.test(
    formatted.message
  );
}

type InteractionsCreateParams = Parameters<
  GoogleGenAI["interactions"]["create"]
>[0] & {
  stream?: false;
};
type InteractionResult = Extract<
  Awaited<ReturnType<GoogleGenAI["interactions"]["create"]>>,
  { output_text?: string | null }
>;

export async function createInteractionWithFallback(
  ai: Pick<GoogleGenAI, "interactions">,
  buildRequest: (model: string) => InteractionsCreateParams,
  options: {
    models?: readonly string[];
    retryDelayMs?: number;
  } = {}
): Promise<{ interaction: InteractionResult; modelUsed: string }> {
  const models = options.models ?? GEMINI_FALLBACK_MODELS;
  const retryDelayMs = options.retryDelayMs ?? 700;
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const maxAttempts = i === 0 ? 2 : 1; // retry primary once before failing over
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const interaction = (await ai.interactions.create(
          buildRequest(model)
        )) as InteractionResult;
        return { interaction, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (!isTransientCapacityError(err)) {
          throw err;
        }
        if (attempt < maxAttempts && retryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      }
    }
  }

  throw lastError;
}

export function resolveApiKey(overrideKey?: string | null): string | null {
  const trimmedOverride = overrideKey?.trim();
  if (trimmedOverride) return trimmedOverride;
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return envKey?.trim() || null;
}

export function createGeminiClient(overrideKey?: string | null): GoogleGenAI {
  const apiKey = resolveApiKey(overrideKey);
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  return new GoogleGenAI({ apiKey });
}

const GRADING_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    transcribedText: {
      type: "string",
      description:
        "Verbatim text of the student's submission ONLY (never include the teacher's model answer). If handwritten images or PDFs were supplied, transcribe the student's work faithfully preserving spelling, punctuation, and line breaks without fixing mistakes.",
    },
    detectedTitle: {
      type: "string",
      description:
        "The title of the essay, quiz, or homework if present, or a brief 3-6 word topic label.",
    },
    wordCount: {
      type: "integer",
      description: "Approximate word count of the student submission.",
    },
    summaryFeedback: {
      type: "string",
      description:
        "Warm, constructive 2-4 sentence teacher summary addressed directly to the student.",
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      description:
        "2 to 4 concrete strengths citing specific details from the student's writing.",
    },
    priorityNextSteps: {
      type: "array",
      items: { type: "string" },
      description:
        "2 to 4 specific, actionable next steps for the student to improve in revision.",
    },
    criterionScores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterionId: { type: "string" },
          criterionName: { type: "string" },
          score: { type: "number" },
          maxScore: { type: "number" },
          rationale: {
            type: "string",
            description:
              "1-2 sentences explaining the score using evidence from the student text (and comparing against the model answer key if provided).",
          },
        },
        required: [
          "criterionId",
          "criterionName",
          "score",
          "maxScore",
          "rationale",
        ],
      },
    },
    annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: {
            type: "string",
            description:
              "EXACT character-for-character substring copied verbatim from transcribedText.",
          },
          contextBefore: {
            type: "string",
            description:
              "Up to 25 characters immediately preceding quote in transcribedText to disambiguate repeated words, or empty string if at start.",
          },
          category: {
            type: "string",
            enum: [
              "grammar",
              "spelling",
              "punctuation",
              "vocabulary",
              "clarity",
              "structure",
              "praise",
            ],
          },
          severity: {
            type: "string",
            enum: ["must_fix", "suggestion", "strength"],
          },
          suggestedRevision: {
            type: "string",
            description:
              "Corrected or improved replacement text for quote, or empty string when category is praise.",
          },
          explanation: {
            type: "string",
            description:
              "Clear, student-friendly explanation of the rule, writing principle, or comparison to the model answer key.",
          },
        },
        required: [
          "quote",
          "contextBefore",
          "category",
          "severity",
          "suggestedRevision",
          "explanation",
        ],
      },
    },
    questionResults: {
      type: "array",
      description:
        "Question-by-question auto-correction breakdown for quizzes, homework, or mixed MCQ + essay prompts. Return one entry per numbered question (MCQs, short answers, and essay questions like Q5). Return [] only if there are no numbered questions or answer key items.",
      items: {
        type: "object",
        properties: {
          questionNumber: {
            type: "string",
            description:
              "Question number string without punctuation, e.g. '1', '2', '3', '5'.",
          },
          questionType: {
            type: "string",
            enum: ["mcq", "short_answer", "essay"],
          },
          promptOrTopic: {
            type: "string",
            description:
              "Brief label describing the question (e.g. 'Multiple Choice Q1' or 'Q5 Essay').",
          },
          expectedAnswer: {
            type: "string",
            description:
              "Expected uppercase letter for MCQs (e.g. 'C') or key points expected for open/essay questions.",
          },
          studentAnswer: {
            type: "string",
            description:
              "Student's chosen letter for MCQs (e.g. 'C' or 'Unanswered') or brief excerpt/summary for open/essay questions.",
          },
          status: {
            type: "string",
            enum: ["correct", "incorrect", "partial", "missing"],
          },
          pointsEarned: { type: "number" },
          maxPoints: { type: "number" },
          explanation: { type: "string" },
        },
        required: [
          "questionNumber",
          "questionType",
          "promptOrTopic",
          "expectedAnswer",
          "studentAnswer",
          "status",
          "pointsEarned",
          "maxPoints",
          "explanation",
        ],
      },
    },
    revisedDraft: {
      type: "string",
      description:
        "A clean revised draft of the student's work applying grammar, spelling, punctuation, and clarity fixes while keeping the student's voice and ideas.",
    },
  },
  required: [
    "transcribedText",
    "detectedTitle",
    "wordCount",
    "summaryFeedback",
    "strengths",
    "priorityNextSteps",
    "criterionScores",
    "annotations",
    "questionResults",
    "revisedDraft",
  ],
};

function buildToneInstruction(tone: GradingTone): string {
  switch (tone) {
    case "encouraging":
      return "Use an encouraging, growth-minded coaching tone suitable for building confidence while still identifying core mechanical or factual errors clearly.";
    case "strict":
      return "Apply rigorous exam-prep standards: catch subtle grammar, comma splice, tense shift, weak claim, missing key points, and precision issues thoroughly.";
    case "balanced":
    default:
      return "Use a supportive yet accurate classroom teacher standard: praise genuine strengths and prioritize meaningful accuracy, grammar, clarity, and structure improvements.";
  }
}

export type AttachmentInput = ParsedMediaFile;

type InputBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      data?: string;
      uri?: string;
      mime_type: string;
      resolution?: "low" | "medium" | "high";
    }
  | {
      type: "document";
      data?: string;
      uri?: string;
      mime_type: string;
    };

const INLINE_PDF_LIMIT_BYTES = 12 * 1024 * 1024;

async function buildMediaBlocks(
  ai: GoogleGenAI,
  files: AttachmentInput[]
): Promise<InputBlock[]> {
  const blocks: InputBlock[] = [];
  for (const attachment of files) {
    if (attachment.mimeType === "application/pdf") {
      if (attachment.buffer.byteLength <= INLINE_PDF_LIMIT_BYTES) {
        blocks.push({
          type: "document",
          data: attachment.buffer.toString("base64"),
          mime_type: "application/pdf",
        });
      } else {
        const uploaded = await ai.files.upload({
          file: new Blob([new Uint8Array(attachment.buffer)], {
            type: "application/pdf",
          }),
          config: { mimeType: "application/pdf" },
        });
        if (!uploaded.uri) {
          throw new Error(
            `Failed to upload PDF "${attachment.originalName}" to Gemini Files API.`
          );
        }
        blocks.push({
          type: "document",
          uri: uploaded.uri,
          mime_type: uploaded.mimeType || "application/pdf",
        });
      }
    } else if (attachment.mimeType.startsWith("image/")) {
      blocks.push({
        type: "image",
        data: attachment.buffer.toString("base64"),
        mime_type: attachment.mimeType,
        resolution: "high",
      });
    }
  }
  return blocks;
}

export interface GradeSubmissionParams {
  apiKeyOverride?: string | null;
  studentName: string;
  assignmentTitle: string;
  assignmentPrompt: string;
  gradeLevel: string;
  rubricName: string;
  criteria: RubricCriterion[];
  inputText: string;
  attachments: AttachmentInput[];
  modelAnswerText?: string;
  modelAnswerAttachments?: AttachmentInput[];
  tone: GradingTone;
  thinkingLevel: ThinkingLevel;
}

export interface GradeSubmissionResult {
  parsed: GeminiGradingOutput;
  transcribedText: string;
  wordCount: number;
  criterionScores: CriterionScore[];
  questionResults: QuestionResult[];
  annotations: AnnotationItem[];
  aiPercentage: number;
  aiLetterGrade: string;
  modelUsed: string;
  interactionId: string | null;
  usageTokens: number | null;
}

export async function gradeSubmissionWithGemini(
  params: GradeSubmissionParams
): Promise<GradeSubmissionResult> {
  const ai = createGeminiClient(params.apiKeyOverride);

  const modelAnswerText = (params.modelAnswerText || "").trim();
  const modelAnswerAttachments = params.modelAnswerAttachments || [];
  const hasModelAnswer =
    modelAnswerText.length > 0 || modelAnswerAttachments.length > 0;
  const parsedAnswerKey = parseAnswerKeyText(modelAnswerText);

  const systemRules = [
    "You are an experienced middle and high school English teacher grading student quizzes, homework, and essays.",
    buildToneInstruction(params.tone),
    "CRITICAL RULES:",
    "1. If images or PDFs of handwritten or typed student work are attached, transcribe ONLY the STUDENT'S work faithfully into `transcribedText`, preserving original spelling errors, punctuation mistakes, and paragraph breaks verbatim so inline annotations align accurately.",
    "2. If typed student text is provided without student attachments, keep `transcribedText` faithful to the provided student text.",
    "3. Return one entry in `criterionScores` for EACH rubric criterion provided, matching its exact `criterionId`, `criterionName`, and `maxScore`.",
    "4. For every item in `annotations`, `quote` MUST be an exact, verbatim substring copied from `transcribedText` (usually a word, phrase, or single sentence—never multiple paragraphs). Include `contextBefore` (up to 25 chars right before `quote`) so repeated words can be matched cleanly.",
    "5. Include both corrective annotations (grammar, spelling, punctuation, clarity, vocabulary, structure) AND 1-3 positive `praise` annotations (`severity: 'strength'`) highlighting strong phrasing or ideas.",
    "6. Explain *why* a correction improves the writing in clear, age-appropriate language for students.",
  ];

  if (hasModelAnswer) {
    systemRules.push(
      "7. MODEL ANSWER / ANSWER KEY PROVIDED: Grade the student's responses EXPLICITLY against the Teacher's Model Answer / Answer Key (text and/or attached answer-key image(s)/PDF(s)).",
      "8. MIXED MCQ & ESSAY AUTO-CORRECTION: Populate `questionResults` for every numbered question (both objective MCQ / True-False items and open/essay questions such as Question 5). Compare MCQ option letters case-insensitively and ignoring formatting (`1.c`, `1) C`, `1. (c)` are identical), award full points for exact MCQ matches and 0 for wrong or missing choices, and grade essay/open questions with full rubric scoring, verbatim inline `annotations`, and a `revisedDraft`.",
      "9. NEVER copy or transcribe the Teacher's Model Answer into `transcribedText` or treat the Answer Key attachment as student writing."
    );
  } else {
    systemRules.push(
      "7. If the student submission contains numbered questions (MCQs, short answers, or numbered essay questions), also populate `questionResults` for each numbered question; otherwise set `questionResults` to `[]`."
    );
  }

  const systemInstruction = systemRules.join("\n");

  const rubricBlock = params.criteria
    .map(
      (c) =>
        `- criterionId: "${c.id}", criterionName: "${c.name}", maxScore: ${c.maxScore} — ${c.description}`
    )
    .join("\n");

  const headerContext = [
    `Student Name: ${params.studentName}`,
    `Grade Level: ${params.gradeLevel}`,
    `Assignment: ${params.assignmentTitle}`,
    `Assignment Prompt / Homework Instructions:\n${params.assignmentPrompt || "General English writing / quiz / homework assignment."}`,
    `Rubric (${params.rubricName}):\n${rubricBlock}`,
  ].join("\n\n");

  const inputBlocks: InputBlock[] = [{ type: "text", text: headerContext }];

  if (hasModelAnswer) {
    const parsedSummaryLines: string[] = [];
    if (parsedAnswerKey.mcqKeys.length > 0) {
      parsedSummaryLines.push(
        `Detected Objective MCQ Keys (case-insensitive exact matching): ${parsedAnswerKey.mcqKeys
          .map((k) => `${k.questionNumber} -> ${k.expectedAnswer} (${k.maxPoints} pt${k.maxPoints === 1 ? "" : "s"})`)
          .join(", ")}`
      );
    }
    if (parsedAnswerKey.openQuestions.length > 0) {
      parsedSummaryLines.push(
        `Detected Open/Essay Questions (auto-correct with rubric & inline feedback): ${parsedAnswerKey.openQuestions
          .map((q) => `Q${q.questionNumber}: ${q.label}`)
          .join(" | ")}`
      );
    }

    const keyHeader = [
      "=== TEACHER'S MODEL ANSWER / ANSWER KEY (AUTHORITATIVE REFERENCE — DO NOT TRANSCRIBE AS STUDENT WORK) ===",
      modelAnswerText
        ? `Model Answer Text:\n"""\n${modelAnswerText}\n"""`
        : "No typed model answer text was entered; use the attached Answer Key image(s)/PDF(s) immediately below as the authoritative reference.",
      ...(parsedSummaryLines.length > 0 ? [parsedSummaryLines.join("\n")] : []),
    ].join("\n\n");
    inputBlocks.push({ type: "text", text: keyHeader });

    if (modelAnswerAttachments.length > 0) {
      const keyMediaBlocks = await buildMediaBlocks(ai, modelAnswerAttachments);
      inputBlocks.push(...keyMediaBlocks);
    }
  }

  const studentHeader = [
    "=== STUDENT SUBMISSION TO TRANSCRIBE AND GRADE ===",
    params.inputText.trim()
      ? `Student Typed Submission:\n"""\n${params.inputText.trim()}\n"""`
      : "No typed text was entered. Read and transcribe the attached student homework image(s)/PDF(s) below, then grade and annotate the transcribed text.",
  ].join("\n\n");
  inputBlocks.push({ type: "text", text: studentHeader });

  if (params.attachments.length > 0) {
    const studentMediaBlocks = await buildMediaBlocks(ai, params.attachments);
    inputBlocks.push(...studentMediaBlocks);
  }

  const { interaction, modelUsed } = await createInteractionWithFallback(
    ai,
    (model) => ({
      model,
      system_instruction: systemInstruction,
      generation_config: {
        thinking_level: params.thinkingLevel,
      },
      input: [
        {
          type: "user_input",
          content: inputBlocks,
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: GRADING_RESPONSE_JSON_SCHEMA,
      },
    })
  );

  const rawText = interaction.output_text;
  if (!rawText) {
    throw new Error(
      `Gemini returned an empty response (status: ${interaction.status}). Please try again.`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini returned malformed JSON. Please retry grading.");
  }

  const validated = GeminiGradingOutputSchema.parse(parsedJson);

  // When typed text was submitted without student attachments, keep exact original student text
  const finalStudentText =
    params.inputText.trim() && params.attachments.length === 0
      ? params.inputText.trim()
      : validated.transcribedText.trim();

  // Reconcile criterionScores strictly against the requested rubric criteria
  const scoreMap = new Map(
    validated.criterionScores.map((cs) => [cs.criterionId, cs])
  );
  const normalizedCriterionScores: CriterionScore[] = params.criteria.map(
    (criterion, index) => {
      const matched =
        scoreMap.get(criterion.id) ||
        validated.criterionScores.find(
          (cs) =>
            cs.criterionName.toLowerCase() === criterion.name.toLowerCase()
        ) ||
        validated.criterionScores[index];

      return {
        criterionId: criterion.id,
        criterionName: criterion.name,
        score: clampScore(matched?.score ?? 0, criterion.maxScore),
        maxScore: criterion.maxScore,
        teacherScore: null,
        rationale:
          matched?.rationale || "Evaluated based on rubric criteria.",
      };
    }
  );

  const questionResults = reconcileQuestionResults({
    rawResults: validated.questionResults,
    modelAnswerText,
    studentText: finalStudentText,
  });

  const syncedCriterionScores = applyMcqResultsToCriteria(
    normalizedCriterionScores,
    questionResults,
    "ai"
  );

  const totals = computeCriterionTotals(syncedCriterionScores);
  const normalizedAnnotations: AnnotationItem[] = validated.annotations.map(
    (item, idx) => ({
      id: `ann-${Date.now()}-${idx}`,
      quote: item.quote,
      contextBefore: item.contextBefore,
      category: item.category,
      severity: item.severity,
      suggestedRevision: item.suggestedRevision,
      explanation: item.explanation,
      status: "pending",
      teacherNote: "",
    })
  );

  return {
    parsed: validated,
    transcribedText: finalStudentText,
    wordCount: countWords(finalStudentText),
    criterionScores: syncedCriterionScores,
    questionResults,
    annotations: normalizedAnnotations,
    aiPercentage: totals.percentage,
    aiLetterGrade: calculateLetterGrade(totals.percentage),
    modelUsed,
    interactionId: interaction.id ?? null,
    usageTokens: interaction.usage?.total_tokens ?? null,
  };
}

export async function askFollowUpWithGemini(params: {
  apiKeyOverride?: string | null;
  submission: Submission;
  teacherMessage: string;
}): Promise<{ reply: string; interactionId: string | null }> {
  const ai = createGeminiClient(params.apiKeyOverride);
  const { submission, teacherMessage } = params;

  const systemInstruction = [
    "You are a knowledgeable English teaching co-pilot helping a teacher review a student's graded quiz, homework, or essay.",
    "Be concise, practical, and ready to use in the classroom (bullet points, practice exercises, or parent-friendly wording when requested).",
  ].join(" ");

  const prevId = submission.lastInteractionId || submission.interactionId;

  if (prevId) {
    try {
      const interaction = await ai.interactions.create({
        model: GEMINI_MODEL,
        previous_interaction_id: prevId,
        system_instruction: systemInstruction,
        generation_config: {
          thinking_level: "low",
        },
        input: teacherMessage,
      });

      if (interaction.output_text) {
        return {
          reply: interaction.output_text,
          interactionId: interaction.id ?? prevId,
        };
      }
    } catch {
      // Fall back to stateless context call if previous interaction expired or failed
    }
  }

  const contextParts = [
    `Student: ${submission.studentName} (${submission.detectedTitle})`,
    `AI Score: ${submission.aiPercentage}% (${submission.aiLetterGrade})`,
  ];
  if (submission.modelAnswerText?.trim()) {
    contextParts.push(
      `Model Answer Key:\n"""\n${submission.modelAnswerText.slice(0, 3000)}\n"""`
    );
  }
  contextParts.push(
    `Student Text:\n"""\n${submission.transcribedText.slice(0, 6000)}\n"""`,
    `Summary Feedback: ${submission.summaryFeedback}`,
    `Key Next Steps: ${submission.priorityNextSteps.join("; ")}`,
    `Teacher Question: ${teacherMessage}`
  );

  const { interaction: fallbackInteraction } =
    await createInteractionWithFallback(ai, (model) => ({
      model,
      system_instruction: systemInstruction,
      generation_config: {
        thinking_level: "low",
      },
      input: contextParts.join("\n\n"),
    }));

  if (!fallbackInteraction.output_text) {
    throw new Error("Gemini returned an empty follow-up response.");
  }

  return {
    reply: fallbackInteraction.output_text,
    interactionId: fallbackInteraction.id ?? null,
  };
}

export async function testGeminiConnection(
  apiKeyOverride?: string | null
): Promise<{
  ok: boolean;
  model: string;
  message: string;
}> {
  const ai = createGeminiClient(apiKeyOverride);
  const { interaction, modelUsed } = await createInteractionWithFallback(
    ai,
    (model) => ({
      model,
      input: "Respond with the exact words: Connection verified.",
      generation_config: {
        thinking_level: "low",
      },
      store: false,
    })
  );
  return {
    ok: true,
    model: modelUsed,
    message:
      interaction.output_text?.trim() || `Connected to ${modelUsed}.`,
  };
}
