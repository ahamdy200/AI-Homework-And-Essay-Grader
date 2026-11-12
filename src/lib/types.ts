import { z } from "zod";

export const GEMINI_MODEL = "gemini-3.8-flash" as const;

export type GradingTone = "encouraging" | "balanced" | "strict";
export type ThinkingLevel = "low" | "medium" | "high";
export type SubmissionStatus = "ai_graded" | "reviewed" | "finalized";

export const AnnotationCategorySchema = z.enum([
  "grammar",
  "spelling",
  "punctuation",
  "vocabulary",
  "clarity",
  "structure",
  "praise",
]);

export type AnnotationCategory = z.infer<typeof AnnotationCategorySchema>;

export const AnnotationSeveritySchema = z.enum([
  "must_fix",
  "suggestion",
  "strength",
]);

export type AnnotationSeverity = z.infer<typeof AnnotationSeveritySchema>;

export const QuestionTypeSchema = z.enum(["mcq", "short_answer", "essay"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const QuestionStatusSchema = z.enum([
  "correct",
  "incorrect",
  "partial",
  "missing",
]);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

export interface QuestionResult {
  id: string;
  questionNumber: string;
  questionType: QuestionType;
  promptOrTopic: string;
  expectedAnswer: string;
  studentAnswer: string;
  status: QuestionStatus;
  pointsEarned: number;
  maxPoints: number;
  teacherPoints: number | null;
  explanation: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxScore: number;
}

export interface RubricPreset {
  id: string;
  name: string;
  gradeLevel: string;
  description: string;
  criteria: RubricCriterion[];
}

export interface Assignment {
  id: string;
  title: string;
  prompt: string;
  gradeLevel: string;
  rubricName: string;
  criteria: RubricCriterion[];
  modelAnswerText: string;
  modelAnswerAttachments: UploadedAttachment[];
  createdAt: string;
}

export interface AnnotationItem {
  id: string;
  quote: string;
  contextBefore: string;
  category: AnnotationCategory;
  severity: AnnotationSeverity;
  suggestedRevision: string;
  explanation: string;
  status: "pending" | "accepted" | "dismissed";
  teacherNote: string;
}

export interface CriterionScore {
  criterionId: string;
  criterionName: string;
  score: number;
  maxScore: number;
  teacherScore: number | null;
  rationale: string;
}

export interface UploadedAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  urlPath: string;
}

export interface FollowUpMessage {
  id: string;
  role: "teacher" | "assistant";
  content: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentName: string;
  studentIdCode: string;
  submittedAt: string;
  updatedAt: string;
  inputText: string;
  transcribedText: string;
  detectedTitle: string;
  wordCount: number;
  attachments: UploadedAttachment[];
  modelAnswerText?: string;
  modelAnswerAttachments?: UploadedAttachment[];
  rubricCriteria: RubricCriterion[];
  criterionScores: CriterionScore[];
  aiPercentage: number;
  aiLetterGrade: string;
  teacherPercentageOverride: number | null;
  teacherLetterGradeOverride: string | null;
  summaryFeedback: string;
  teacherFinalComment: string;
  strengths: string[];
  priorityNextSteps: string[];
  annotations: AnnotationItem[];
  revisedDraft: string;
  status: SubmissionStatus;
  tone: GradingTone;
  thinkingLevel: ThinkingLevel;
  modelUsed: string;
  interactionId: string | null;
  lastInteractionId: string | null;
  usageTokens: number | null;
  questionResults?: QuestionResult[];
  followUps: FollowUpMessage[];
}

export interface WorkbenchData {
  assignments: Assignment[];
  submissions: Submission[];
}

/**
 * Zod schema validating the JSON returned by Gemini Interactions API structured output.
 */
export const GeminiGradingOutputSchema = z.object({
  transcribedText: z.string().min(1),
  detectedTitle: z.string(),
  wordCount: z.number().int().nonnegative(),
  summaryFeedback: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  priorityNextSteps: z.array(z.string()).min(1),
  criterionScores: z
    .array(
      z.object({
        criterionId: z.string(),
        criterionName: z.string(),
        score: z.number(),
        maxScore: z.number().positive(),
        rationale: z.string(),
      })
    )
    .min(1),
  annotations: z.array(
    z.object({
      quote: z.string(),
      contextBefore: z.string(),
      category: AnnotationCategorySchema,
      severity: AnnotationSeveritySchema,
      suggestedRevision: z.string(),
      explanation: z.string(),
    })
  ),
  questionResults: z
    .array(
      z.object({
        questionNumber: z.string(),
        questionType: QuestionTypeSchema,
        promptOrTopic: z.string(),
        expectedAnswer: z.string(),
        studentAnswer: z.string(),
        status: QuestionStatusSchema,
        pointsEarned: z.number(),
        maxPoints: z.number(),
        explanation: z.string(),
      })
    )
    .default([]),
  revisedDraft: z.string(),
});

export type GeminiGradingOutput = z.infer<typeof GeminiGradingOutputSchema>;
