import type { CriterionScore, Submission } from "./types";

export function calculateLetterGrade(percentage: number): string {
  const rounded = Math.round(percentage);
  if (rounded >= 97) return "A+";
  if (rounded >= 93) return "A";
  if (rounded >= 90) return "A-";
  if (rounded >= 87) return "B+";
  if (rounded >= 83) return "B";
  if (rounded >= 80) return "B-";
  if (rounded >= 77) return "C+";
  if (rounded >= 73) return "C";
  if (rounded >= 70) return "C-";
  if (rounded >= 67) return "D+";
  if (rounded >= 63) return "D";
  if (rounded >= 60) return "D-";
  return "F";
}

export function clampScore(value: number, maxScore: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(maxScore, value));
  return Math.round(clamped * 10) / 10;
}

export function computeCriterionTotals(criterionScores: CriterionScore[]): {
  earned: number;
  max: number;
  percentage: number;
  letterGrade: string;
} {
  let earned = 0;
  let max = 0;
  for (const item of criterionScores) {
    const effective = item.teacherScore !== null ? item.teacherScore : item.score;
    earned += clampScore(effective, item.maxScore);
    max += item.maxScore;
  }
  const percentage = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
  return {
    earned: Math.round(earned * 10) / 10,
    max: Math.round(max * 10) / 10,
    percentage,
    letterGrade: calculateLetterGrade(percentage),
  };
}

export function getEffectiveSubmissionGrade(submission: Submission): {
  earned: number;
  max: number;
  percentage: number;
  letterGrade: string;
  isOverridden: boolean;
} {
  const criterionTotals = computeCriterionTotals(submission.criterionScores);
  const hasTeacherCriterionEdit = submission.criterionScores.some(
    (c) => c.teacherScore !== null
  );
  if (submission.teacherPercentageOverride !== null) {
    const pct = Math.max(0, Math.min(100, submission.teacherPercentageOverride));
    return {
      earned: criterionTotals.earned,
      max: criterionTotals.max,
      percentage: pct,
      letterGrade:
        submission.teacherLetterGradeOverride || calculateLetterGrade(pct),
      isOverridden: true,
    };
  }
  return {
    earned: criterionTotals.earned,
    max: criterionTotals.max,
    percentage: criterionTotals.percentage,
    letterGrade:
      submission.teacherLetterGradeOverride || criterionTotals.letterGrade,
    isOverridden:
      hasTeacherCriterionEdit ||
      submission.teacherLetterGradeOverride !== null,
  };
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
