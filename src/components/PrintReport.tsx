"use client";

import React from "react";
import { summarizeQuestionResults } from "@/lib/mcq";
import { getEffectiveSubmissionGrade } from "@/lib/scoring";
import type { Assignment, Submission } from "@/lib/types";

interface PrintReportProps {
  submission: Submission | null;
  assignment?: Assignment;
}

export function PrintReport({ submission, assignment }: PrintReportProps) {
  if (!submission) return null;

  const effective = getEffectiveSubmissionGrade(submission);
  const questionResults = submission.questionResults ?? [];
  const questionSummary = summarizeQuestionResults(questionResults);
  const activeAnnotations = submission.annotations.filter(
    (a) => a.status !== "dismissed"
  );

  return (
    <div className="print-only mx-auto max-w-3xl bg-white p-6 text-stone-900">
      <div className="border-b-2 border-stone-900 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
              English Writing &amp; Homework Feedback Report
            </p>
            <h1 className="font-serif-paper mt-1 text-2xl font-bold text-stone-900">
              {submission.detectedTitle || assignment?.title || "Student Writing"}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Student: <span className="font-semibold">{submission.studentName}</span>
              {submission.studentIdCode ? ` (${submission.studentIdCode})` : ""}
              {assignment ? ` • ${assignment.title} (${assignment.gradeLevel})` : ""}
            </p>
          </div>
          <div className="rounded-lg border border-stone-300 px-4 py-2 text-right">
            <div className="font-mono-score text-2xl font-bold text-stone-900">
              {effective.letterGrade}
            </div>
            <div className="font-mono-score text-xs text-stone-600">
              {effective.earned} / {effective.max} ({effective.percentage}%)
            </div>
          </div>
        </div>
      </div>

      <section className="mt-5">
        <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">
          Teacher Feedback Summary
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-800">
          {submission.teacherFinalComment || submission.summaryFeedback}
        </p>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <section className="rounded-lg border border-stone-200 p-3">
          <h3 className="text-xs font-bold tracking-wider text-emerald-800 uppercase">
            Strengths
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-700">
            {submission.strengths.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-stone-200 p-3">
          <h3 className="text-xs font-bold tracking-wider text-amber-800 uppercase">
            Priority Next Steps
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-700">
            {submission.priorityNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5">
        <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">
          Rubric Scorecard
        </h2>
        <table className="mt-2 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-50">
              <th className="p-2 font-semibold">Criterion</th>
              <th className="p-2 font-semibold">Score</th>
              <th className="p-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {submission.criterionScores.map((c) => {
              const score = c.teacherScore !== null ? c.teacherScore : c.score;
              return (
                <tr key={c.criterionId} className="border-b border-stone-200">
                  <td className="p-2 font-medium text-stone-900">
                    {c.criterionName}
                  </td>
                  <td className="font-mono-score p-2 font-semibold">
                    {score} / {c.maxScore}
                  </td>
                  <td className="p-2 text-stone-700">{c.rationale}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {questionResults.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">
              Question-by-Question Auto-Correction
            </h2>
            <span className="text-xs font-semibold text-stone-700">
              {questionSummary.mcqTotal > 0
                ? `MCQs: ${questionSummary.mcqCorrect}/${questionSummary.mcqTotal} (${questionSummary.mcqEarned}/${questionSummary.mcqMax} pts)`
                : ""}
              {questionSummary.mcqTotal > 0 && questionSummary.openTotal > 0
                ? " • "
                : ""}
              {questionSummary.openTotal > 0
                ? `Open/Essay: ${questionSummary.openEarned}/${questionSummary.openMax} pts`
                : ""}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {questionResults.map((q) => {
              const pts =
                q.teacherPoints !== null ? q.teacherPoints : q.pointsEarned;
              return (
                <div
                  key={q.id}
                  className="rounded border border-stone-200 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-900">
                      Q{q.questionNumber} [{q.questionType.toUpperCase()}] —{" "}
                      {q.promptOrTopic}
                    </span>
                    <span className="font-semibold text-stone-800">
                      {q.status.toUpperCase()} ({pts}/{q.maxPoints} pts)
                    </span>
                  </div>
                  <p className="mt-0.5 text-stone-600">
                    Student: <strong>{q.studentAnswer || "Unanswered"}</strong>{" "}
                    | Key: <strong>{q.expectedAnswer}</strong>
                  </p>
                  {q.explanation && (
                    <p className="mt-0.5 text-stone-700">{q.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeAnnotations.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">
            Line-by-Line Notes ({activeAnnotations.length})
          </h2>
          <div className="mt-2 space-y-2">
            {activeAnnotations.map((a, idx) => (
              <div
                key={a.id}
                className="rounded border border-stone-200 p-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase text-stone-700">
                    {idx + 1}. {a.category}
                  </span>
                  <span className="text-stone-500">•</span>
                  <span className="italic text-stone-800">&ldquo;{a.quote}&rdquo;</span>
                  {a.suggestedRevision && (
                    <span className="font-semibold text-emerald-800">
                      → &ldquo;{a.suggestedRevision}&rdquo;
                    </span>
                  )}
                </div>
                <p className="mt-1 text-stone-700">
                  {a.teacherNote ? `${a.teacherNote} — ` : ""}
                  {a.explanation}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 border-t border-stone-200 pt-4">
        <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">
          Student Submission Text
        </h2>
        <div className="font-serif-paper mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
          {submission.transcribedText}
        </div>
      </section>
    </div>
  );
}
