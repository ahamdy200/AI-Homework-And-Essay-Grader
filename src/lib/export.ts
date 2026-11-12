import { summarizeQuestionResults } from "./mcq";
import { getEffectiveSubmissionGrade } from "./scoring";
import type { Assignment, Submission } from "./types";

export function formatStudentFeedbackMarkdown(
  submission: Submission,
  assignment?: Assignment
): string {
  const effective = getEffectiveSubmissionGrade(submission);
  const lines: string[] = [];

  lines.push(`# Writing Feedback: ${submission.detectedTitle || assignment?.title || "Student Submission"}`);
  lines.push(`**Student:** ${submission.studentName}${submission.studentIdCode ? ` (${submission.studentIdCode})` : ""}`);
  if (assignment) {
    lines.push(`**Assignment:** ${assignment.title} (${assignment.gradeLevel})`);
  }
  lines.push(
    `**Final Score:** ${effective.earned} / ${effective.max} (${effective.percentage}% — ${effective.letterGrade})`
  );
  lines.push("");

  lines.push("## Teacher Summary");
  lines.push(submission.teacherFinalComment || submission.summaryFeedback);
  lines.push("");

  if (submission.strengths.length > 0) {
    lines.push("## Strengths");
    for (const s of submission.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (submission.priorityNextSteps.length > 0) {
    lines.push("## Next Steps for Revision");
    for (const step of submission.priorityNextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  const questionResults = submission.questionResults ?? [];
  if (questionResults.length > 0) {
    const qSummary = summarizeQuestionResults(questionResults);
    lines.push("## Question-by-Question Auto-Correction");
    if (qSummary.mcqTotal > 0) {
      lines.push(
        `- **MCQs:** ${qSummary.mcqCorrect}/${qSummary.mcqTotal} correct (${qSummary.mcqEarned}/${qSummary.mcqMax} pts)`
      );
    }
    if (qSummary.openTotal > 0) {
      lines.push(
        `- **Open/Essay Questions:** ${qSummary.openEarned}/${qSummary.openMax} pts`
      );
    }
    for (const q of questionResults) {
      const pts = q.teacherPoints !== null ? q.teacherPoints : q.pointsEarned;
      lines.push(
        `- **Q${q.questionNumber} (${q.questionType.toUpperCase()}):** Student \`${q.studentAnswer || "Unanswered"}\` vs Key \`${q.expectedAnswer}\` — **${q.status.toUpperCase()}** (${pts}/${q.maxPoints} pts)${q.explanation ? ` — ${q.explanation}` : ""}`
      );
    }
    lines.push("");
  }

  lines.push("## Rubric Breakdown");
  for (const c of submission.criterionScores) {
    const score = c.teacherScore !== null ? c.teacherScore : c.score;
    lines.push(`- **${c.criterionName}** (${score}/${c.maxScore}): ${c.rationale}`);
  }
  lines.push("");

  const activeAnnotations = submission.annotations.filter(
    (a) => a.status !== "dismissed" && a.category !== "praise"
  );
  if (activeAnnotations.length > 0) {
    lines.push("## Key Writing Corrections");
    activeAnnotations.forEach((a, idx) => {
      lines.push(
        `${idx + 1}. **[${a.category.toUpperCase()}]** "${a.quote}" → ${a.suggestedRevision ? `"${a.suggestedRevision}"` : "(see note)"}`
      );
      lines.push(`   ${a.teacherNote ? `${a.teacherNote} — ` : ""}${a.explanation}`);
    });
  }

  return lines.join("\n");
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSubmissionsToCsv(
  submissions: Submission[],
  assignments: Assignment[]
): string {
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
  const headers = [
    "Student Name",
    "Student ID",
    "Assignment",
    "Title",
    "Word Count",
    "Points Earned",
    "Max Points",
    "Percentage",
    "Letter Grade",
    "Status",
    "MCQ Correct",
    "Teacher Comment",
    "Submitted At",
  ];

  const rows = submissions.map((sub) => {
    const effective = getEffectiveSubmissionGrade(sub);
    const assignment = assignmentMap.get(sub.assignmentId);
    const qSummary = summarizeQuestionResults(sub.questionResults ?? []);
    return [
      sub.studentName,
      sub.studentIdCode,
      assignment?.title || "Custom",
      sub.detectedTitle,
      sub.wordCount,
      effective.earned,
      effective.max,
      `${effective.percentage}%`,
      effective.letterGrade,
      sub.status,
      qSummary.mcqTotal > 0
        ? `${qSummary.mcqCorrect}/${qSummary.mcqTotal}`
        : "",
      sub.teacherFinalComment || sub.summaryFeedback,
      sub.submittedAt,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headers.map(escapeCsvCell).join(","), ...rows].join("\r\n");
}
