import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clampScore } from "@/lib/scoring";
import {
  deleteSubmissionFiles,
  findSubmissionById,
  readWorkbenchData,
  updateWorkbenchData,
} from "@/lib/storage";
import {
  AnnotationCategorySchema,
  AnnotationSeveritySchema,
  QuestionStatusSchema,
  QuestionTypeSchema,
} from "@/lib/types";

const PatchSubmissionSchema = z.object({
  status: z.enum(["ai_graded", "reviewed", "finalized"]).optional(),
  teacherPercentageOverride: z.number().min(0).max(100).nullable().optional(),
  teacherLetterGradeOverride: z.string().trim().max(10).nullable().optional(),
  teacherFinalComment: z.string().max(6000).optional(),
  criterionScores: z
    .array(
      z.object({
        criterionId: z.string(),
        criterionName: z.string(),
        score: z.number(),
        maxScore: z.number().positive(),
        teacherScore: z.number().nullable(),
        rationale: z.string(),
      })
    )
    .optional(),
  annotations: z
    .array(
      z.object({
        id: z.string(),
        quote: z.string(),
        contextBefore: z.string(),
        category: AnnotationCategorySchema,
        severity: AnnotationSeveritySchema,
        suggestedRevision: z.string(),
        explanation: z.string(),
        status: z.enum(["pending", "accepted", "dismissed"]),
        teacherNote: z.string(),
      })
    )
    .optional(),
  questionResults: z
    .array(
      z.object({
        id: z.string(),
        questionNumber: z.string(),
        questionType: QuestionTypeSchema,
        promptOrTopic: z.string(),
        expectedAnswer: z.string(),
        studentAnswer: z.string(),
        status: QuestionStatusSchema,
        pointsEarned: z.number(),
        maxPoints: z.number().positive(),
        teacherPoints: z.number().nullable(),
        explanation: z.string(),
      })
    )
    .optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const data = await readWorkbenchData();
    const submission = findSubmissionById(data, id);
    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ submission });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load submission.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = PatchSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let updatedSubmission = null;
    await updateWorkbenchData((current) => {
      const idx = current.submissions.findIndex((s) => s.id === id);
      if (idx === -1) return current;

      const existing = current.submissions[idx];
      const patch = parsed.data;

      const nextCriterionScores = patch.criterionScores
        ? patch.criterionScores.map((c) => ({
            ...c,
            teacherScore:
              c.teacherScore !== null
                ? clampScore(c.teacherScore, c.maxScore)
                : null,
          }))
        : existing.criterionScores;

      const nextQuestionResults = patch.questionResults
        ? patch.questionResults.map((q) => ({
            ...q,
            teacherPoints:
              q.teacherPoints !== null
                ? clampScore(q.teacherPoints, q.maxPoints)
                : null,
          }))
        : existing.questionResults ?? [];

      const nextSubmission = {
        ...existing,
        status: patch.status ?? existing.status,
        teacherPercentageOverride:
          patch.teacherPercentageOverride !== undefined
            ? patch.teacherPercentageOverride
            : existing.teacherPercentageOverride,
        teacherLetterGradeOverride:
          patch.teacherLetterGradeOverride !== undefined
            ? patch.teacherLetterGradeOverride
            : existing.teacherLetterGradeOverride,
        teacherFinalComment:
          patch.teacherFinalComment !== undefined
            ? patch.teacherFinalComment
            : existing.teacherFinalComment,
        criterionScores: nextCriterionScores,
        questionResults: nextQuestionResults,
        annotations: patch.annotations ?? existing.annotations,
        updatedAt: new Date().toISOString(),
      };

      updatedSubmission = nextSubmission;
      const submissions = [...current.submissions];
      submissions[idx] = nextSubmission;
      return { ...current, submissions };
    });

    if (!updatedSubmission) {
      return NextResponse.json(
        { error: "Submission not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ submission: updatedSubmission });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update submission.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    let found = false;
    await updateWorkbenchData((current) => {
      const exists = current.submissions.some((s) => s.id === id);
      if (!exists) return current;
      found = true;
      return {
        ...current,
        submissions: current.submissions.filter((s) => s.id !== id),
      };
    });

    if (!found) {
      return NextResponse.json(
        { error: "Submission not found." },
        { status: 404 }
      );
    }

    await deleteSubmissionFiles(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete submission.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
