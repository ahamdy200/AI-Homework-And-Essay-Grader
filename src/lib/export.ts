import { summarizeQuestionResults } from "./mcq";
import { getEffectiveSubmissionGrade } from "./scoring";
import type { Assignment, Submission } from "./types";

export function formatStudentFeedbackMarkdown(
  submission: Submission,
  assignment?: Assignment
): string {
  const effective = getEffectiveSubmissionGrade(submission);
  const firstName = submission.studentName.trim().split(/\s+/)[0] || "there";
  const lines: string[] = [];

  lines.push(
    `# RCIS Feedback Report: ${submission.detectedTitle || assignment?.title || "English Assignment"}`
  );
  lines.push(
    `**School:** The Royal College International School (RCIS)`
  );
  lines.push(`**Reviewed by:** Mr. Ahmed Hamdy`);
  lines.push(
    `**Student:** ${submission.studentName}${submission.studentIdCode ? ` (${submission.studentIdCode})` : ""}`
  );
  if (assignment) {
    lines.push(`**Assignment:** ${assignment.title} (${assignment.gradeLevel})`);
  }
  lines.push(
    `**Overall Result:** ${effective.earned} / ${effective.max} (${effective.percentage}% — ${effective.letterGrade})`
  );
  lines.push("");

  lines.push("## A Personal Note from Mr. Ahmed Hamdy");
  lines.push(`Dear ${firstName},`);
  lines.push("");
  lines.push(submission.teacherFinalComment || submission.summaryFeedback);
  lines.push("");

  if (submission.strengths.length > 0) {
    lines.push("## What You Did Well");
    for (const s of submission.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (submission.priorityNextSteps.length > 0) {
    lines.push("## Where to Grow Next");
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
    lines.push("## Specific Writing Notes");
    activeAnnotations.forEach((a, idx) => {
      lines.push(
        `${idx + 1}. **[${a.category.toUpperCase()}]** "${a.quote}" → ${a.suggestedRevision ? `"${a.suggestedRevision}"` : "(see note)"}`
      );
      lines.push(`   ${a.teacherNote ? `${a.teacherNote} — ` : ""}${a.explanation}`);
    });
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Warm regards,\n**Mr. Ahmed Hamdy**\nThe Royal College International School (RCIS) • English Department"
  );

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
