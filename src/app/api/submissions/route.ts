import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import {
  formatGeminiError,
  gradeSubmissionWithGemini,
} from "@/lib/gemini";
import { RUBRIC_PRESETS } from "@/lib/presets";
import {
  readStoredAttachments,
  readWorkbenchData,
  saveAnswerKeyAttachments,
  saveSubmissionAttachments,
  updateWorkbenchData,
} from "@/lib/storage";
import {
  type GradingTone,
  type RubricCriterion,
  type Submission,
  type ThinkingLevel,
  type UploadedAttachment,
} from "@/lib/types";
import { parseUploadedFiles, UploadValidationError } from "@/lib/uploads";

const CriterionInputSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    maxScore: z.number().positive(),
  })
);

export async function GET() {
  try {
    const data = await readWorkbenchData();
    return NextResponse.json({ submissions: data.submissions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load submissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const apiKeyOverride = req.headers.get("x-gemini-api-key");

    const studentName = String(formData.get("studentName") || "").trim();
    const studentIdCode = String(formData.get("studentIdCode") || "").trim();
    const assignmentId = String(formData.get("assignmentId") || "").trim();
    const customAssignmentTitle = String(
      formData.get("assignmentTitle") || ""
    ).trim();
    const customPrompt = String(formData.get("assignmentPrompt") || "").trim();
    const gradeLevel = String(formData.get("gradeLevel") || "Grades 6–12").trim();
    const rubricNameInput = String(formData.get("rubricName") || "").trim();
    const rawCriteria = String(formData.get("criteria") || "").trim();
    const toneRaw = String(formData.get("tone") || "balanced");
    const thinkingRaw = String(formData.get("thinkingLevel") || "medium");
    const rawInputText = String(formData.get("inputText") || "");
    const rawModelAnswerText = String(formData.get("modelAnswerText") || "");
    const overrideModelAnswer =
      String(formData.get("overrideModelAnswer") || "") === "true";

    if (!studentName) {
      return NextResponse.json(
        { error: "Student name is required." },
        { status: 400 }
      );
    }

    const tone: GradingTone =
      toneRaw === "encouraging" || toneRaw === "strict" ? toneRaw : "balanced";
    const thinkingLevel: ThinkingLevel =
      thinkingRaw === "low" || thinkingRaw === "high" ? thinkingRaw : "medium";

    const workbench = await readWorkbenchData();
    const matchedAssignment = workbench.assignments.find(
      (a) => a.id === assignmentId
    );
    const defaultPreset = RUBRIC_PRESETS[0];

    let criteria: RubricCriterion[] =
      matchedAssignment?.criteria ?? defaultPreset.criteria;
    if (rawCriteria) {
      const parsedCriteria = CriterionInputSchema.safeParse(
        JSON.parse(rawCriteria)
      );
      if (parsedCriteria.success && parsedCriteria.data.length > 0) {
        criteria = parsedCriteria.data;
      }
    }

    const parsedStudentFiles = await parseUploadedFiles(
      formData.getAll("files"),
      rawInputText
    );
    const inputText = parsedStudentFiles.text;
    const mediaAttachments = parsedStudentFiles.mediaFiles;

    if (!inputText && mediaAttachments.length === 0) {
      return NextResponse.json(
        {
          error:
            "Please paste student writing or upload at least one homework photo or PDF.",
        },
        { status: 400 }
      );
    }

    const parsedFormKeyFiles = await parseUploadedFiles(
      formData.getAll("modelAnswerFiles"),
      rawModelAnswerText
    );

    const useFormOverride =
      !matchedAssignment ||
      overrideModelAnswer ||
      parsedFormKeyFiles.text.length > 0 ||
      parsedFormKeyFiles.mediaFiles.length > 0;

    const effectiveModelAnswerText = useFormOverride
      ? parsedFormKeyFiles.text || matchedAssignment?.modelAnswerText || ""
      : matchedAssignment?.modelAnswerText || "";

    const assignmentKeyFiles =
      matchedAssignment && !overrideModelAnswer
        ? await readStoredAttachments(matchedAssignment.modelAnswerAttachments)
        : [];
    const effectiveKeyMedia = [
      ...assignmentKeyFiles,
      ...parsedFormKeyFiles.mediaFiles,
    ];

    const assignmentTitle =
      customAssignmentTitle ||
      matchedAssignment?.title ||
      "English Homework / Essay";
    const assignmentPrompt =
      customPrompt || matchedAssignment?.prompt || "";
    const rubricName =
      rubricNameInput || matchedAssignment?.rubricName || defaultPreset.name;

    const graded = await gradeSubmissionWithGemini({
      apiKeyOverride,
      studentName,
      assignmentTitle,
      assignmentPrompt,
      gradeLevel: matchedAssignment?.gradeLevel || gradeLevel,
      rubricName,
      criteria,
      inputText,
      attachments: mediaAttachments,
      modelAnswerText: effectiveModelAnswerText,
      modelAnswerAttachments: effectiveKeyMedia,
      tone,
      thinkingLevel,
    });

    const submissionId = `sub-${crypto.randomUUID().slice(0, 10)}`;
    const savedAttachments = await saveSubmissionAttachments(
      submissionId,
      mediaAttachments
    );
    const savedFormKeyAttachments = await saveAnswerKeyAttachments(
      submissionId,
      parsedFormKeyFiles.mediaFiles
    );
    const retainedAssignmentKeyAttachments: UploadedAttachment[] =
      matchedAssignment && !overrideModelAnswer
        ? matchedAssignment.modelAnswerAttachments
        : [];

    const now = new Date().toISOString();
    const submission: Submission = {
      id: submissionId,
      assignmentId: matchedAssignment?.id || assignmentId || "custom",
      studentName,
      studentIdCode,
      submittedAt: now,
      updatedAt: now,
      inputText,
      transcribedText: graded.transcribedText,
      detectedTitle: graded.parsed.detectedTitle || assignmentTitle,
      wordCount: graded.wordCount,
      attachments: savedAttachments,
      modelAnswerText: effectiveModelAnswerText,
      modelAnswerAttachments: [
        ...retainedAssignmentKeyAttachments,
        ...savedFormKeyAttachments,
      ],
      rubricCriteria: criteria,
      criterionScores: graded.criterionScores,
      questionResults: graded.questionResults,
      aiPercentage: graded.aiPercentage,
      aiLetterGrade: graded.aiLetterGrade,
      teacherPercentageOverride: null,
      teacherLetterGradeOverride: null,
      summaryFeedback: graded.parsed.summaryFeedback,
      teacherFinalComment: graded.parsed.summaryFeedback,
      strengths: graded.parsed.strengths,
      priorityNextSteps: graded.parsed.priorityNextSteps,
      annotations: graded.annotations,
      revisedDraft: graded.parsed.revisedDraft,
      status: "ai_graded",
      tone,
      thinkingLevel,
      modelUsed: graded.modelUsed,
      interactionId: graded.interactionId,
      lastInteractionId: graded.interactionId,
      usageTokens: graded.usageTokens,
      followUps: [],
    };

    await updateWorkbenchData((current) => ({
      ...current,
      submissions: [submission, ...current.submissions],
    }));

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const formatted = formatGeminiError(err, "Failed to grade submission.");
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.httpStatus }
    );
  }
}
