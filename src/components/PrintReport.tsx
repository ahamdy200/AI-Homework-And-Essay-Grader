"use client";

import React from "react";
import { summarizeQuestionResults } from "@/lib/mcq";
import { getEffectiveSubmissionGrade } from "@/lib/scoring";
import type { Assignment, QuestionResult, Submission } from "@/lib/types";

interface PrintReportProps {
  submission: Submission | null;
  assignment?: Assignment;
  embedded?: boolean;
}

const QUESTION_STATUS_LABEL: Record<QuestionResult["status"], string> = {
  correct: "Well done",
  partial: "Almost there (Partial credit)",
  incorrect: "Needs another look",
  missing: "Not answered yet",
};

function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

export function PrintReport({
  submission,
  assignment,
  embedded = false,
}: PrintReportProps) {
  if (!submission) return null;

  const effective = getEffectiveSubmissionGrade(submission);
  const questionResults = submission.questionResults ?? [];
  const questionSummary = summarizeQuestionResults(questionResults);
  const activeAnnotations = submission.annotations.filter(
    (a) => a.status !== "dismissed"
  );
  const firstName = getFirstName(submission.studentName);
  const gradedDate = new Date(
    submission.updatedAt || submission.submittedAt
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`${embedded ? "" : "print-only "}mx-auto max-w-3xl bg-white p-6 sm:p-8 text-[#2D2A32]`}
    >
      {/* RCIS Letterhead + Score Badge */}
      <header className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rcis-logo.png"
              alt="The Royal College International School (RCIS)"
              width={132}
              height={72}
              className="h-16 w-auto shrink-0 object-contain"
            />
            <div className="border-l-2 border-[#E3DAF0] pl-4">
              <p className="text-[11px] font-bold tracking-[0.12em] text-[#552985] uppercase">
                English Department • Student Feedback Report
              </p>
              <h1 className="font-serif-paper mt-0.5 text-xl font-bold text-[#2D233D] sm:text-2xl">
                {submission.detectedTitle || assignment?.title || "English Assignment"}
              </h1>
              <p className="mt-1 text-xs text-[#5D5E60]">
                <span className="font-semibold text-[#552985]">Student:</span>{" "}
                <span className="font-semibold text-[#2D2A32]">
                  {submission.studentName}
                </span>
                {submission.studentIdCode ? ` (${submission.studentIdCode})` : ""}
                {assignment ? ` • ${assignment.gradeLevel}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-[#5D5E60]">
                <span className="font-semibold text-[#552985]">
                  Reviewed &amp; Graded by:
                </span>{" "}
                <span className="font-semibold text-[#2D233D]">
                  Mr. Ahmed Hamdy
                </span>{" "}
                • {gradedDate}
              </p>
            </div>
          </div>

          <div className="shrink-0 rounded-xl border-2 border-[#552985] bg-[#F7F4FA] px-5 py-2.5 text-right">
            <div className="text-[10px] font-bold tracking-wider text-[#633C8D] uppercase">
              Overall Result
            </div>
            <div className="font-mono-score text-3xl font-bold text-[#552985]">
              {effective.letterGrade}
            </div>
            <div className="font-mono-score text-xs font-semibold text-[#5D5E60]">
              {effective.earned} / {effective.max} ({effective.percentage}%)
            </div>
          </div>
        </div>

        {/* Brand gradient bar matching the 4-tone RCIS logo rule */}
        <div
          className="mt-4 h-1.5 w-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #552985 0%, #633C8D 35%, #7F5FA8 60%, #997FBC 82%, #AE97C5 100%)",
          }}
        />
      </header>

      {/* Personal Note from Mr. Ahmed Hamdy */}
      <section className="mt-4 rounded-xl border border-[#DFD5EC] bg-[#FBF9FD] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold tracking-wider text-[#552985] uppercase">
            A Personal Note from Mr. Ahmed Hamdy
          </h2>
        </div>
        <p className="mt-2 text-sm font-medium text-[#2D233D]">
          Dear {firstName},
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#3D3944]">
          {submission.teacherFinalComment || submission.summaryFeedback}
        </p>
      </section>

      {/* Strengths & Growth */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[#DFD5EC] border-l-4 border-l-[#552985] bg-[#F7F4FA]/75 p-3.5">
          <h3 className="text-xs font-bold tracking-wider text-[#552985] uppercase">
            What You Did Well
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[#3D3944]">
            {submission.strengths.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[#E2D9EE] border-l-4 border-l-[#997FBC] bg-white p-3.5">
          <h3 className="text-xs font-bold tracking-wider text-[#633C8D] uppercase">
            Where to Grow Next
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[#3D3944]">
            {submission.priorityNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ul>
        </section>
      </div>

      {/* Rubric Scorecard */}
      <section className="mt-5">
        <h2 className="text-xs font-bold tracking-wider text-[#552985] uppercase">
          How Your Score Came Together
        </h2>
        <table className="mt-2 w-full border-collapse overflow-hidden rounded-lg border border-[#E3DAF0] text-left text-xs">
          <thead>
            <tr className="border-b border-[#D7CBE8] bg-[#F7F4FA]">
              <th className="p-2.5 font-semibold text-[#552985]">Criterion</th>
              <th className="p-2.5 font-semibold text-[#552985]">Score</th>
              <th className="p-2.5 font-semibold text-[#552985]">
                Teacher Feedback
              </th>
            </tr>
          </thead>
          <tbody>
            {submission.criterionScores.map((c) => {
              const score = c.teacherScore !== null ? c.teacherScore : c.score;
              return (
                <tr key={c.criterionId} className="border-b border-[#EFEAF6]">
                  <td className="p-2.5 font-semibold text-[#2D233D]">
                    {c.criterionName}
                  </td>
                  <td className="font-mono-score p-2.5 font-bold text-[#552985]">
                    {score} / {c.maxScore}
                  </td>
                  <td className="p-2.5 leading-relaxed text-[#5D5E60]">
                    {c.rationale}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Question-by-Question Check-In */}
      {questionResults.length > 0 && (
        <section className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wider text-[#552985] uppercase">
              Question-by-Question Check-In
            </h2>
            <span className="rounded-full border border-[#DFD5EC] bg-[#F7F4FA] px-3 py-0.5 text-xs font-semibold text-[#552985]">
              {questionSummary.mcqTotal > 0
                ? `MCQs: ${questionSummary.mcqCorrect}/${questionSummary.mcqTotal} (${questionSummary.mcqEarned}/${questionSummary.mcqMax} pts)`
                : ""}
              {questionSummary.mcqTotal > 0 && questionSummary.openTotal > 0
                ? " • "
                : ""}
              {questionSummary.openTotal > 0
                ? `Open / Essay: ${questionSummary.openEarned}/${questionSummary.openMax} pts`
                : ""}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {questionResults.map((q) => {
              const pts =
                q.teacherPoints !== null ? q.teacherPoints : q.pointsEarned;
              const isCorrect = q.status === "correct";
              const isPartial = q.status === "partial";
              const badgeStyle = isCorrect
                ? "border-[#D7CBE8] bg-[#F7F4FA] text-[#552985]"
                : isPartial
                  ? "border-[#AE97C5] bg-[#FAF8FC] text-[#633C8D]"
                  : "border-[#D8D6DC] bg-[#F5F4F6] text-[#5D5E60]";

              return (
                <div
                  key={q.id}
                  className="rounded-lg border border-[#E7E1F0] bg-white p-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#2D233D]">
                      <span className="mr-1.5 inline-block rounded bg-[#552985] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        Q{q.questionNumber}
                      </span>
                      {q.questionType === "mcq"
                        ? "Multiple Choice"
                        : q.questionType === "short_answer"
                          ? "Short Answer"
                          : "Essay Response"}{" "}
                      — {q.promptOrTopic}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeStyle}`}
                    >
                      {QUESTION_STATUS_LABEL[q.status]} ({pts}/{q.maxPoints} pts)
                    </span>
                  </div>
                  <p className="mt-1 text-[#5D5E60]">
                    Your Answer:{" "}
                    <strong className="text-[#2D233D]">
                      {q.studentAnswer || "Unanswered"}
                    </strong>{" "}
                    <span className="mx-1.5 text-[#AE97C5]">|</span>
                    Target / Key:{" "}
                    <strong className="text-[#552985]">
                      {q.expectedAnswer}
                    </strong>
                  </p>
                  {q.explanation && (
                    <p className="mt-1 leading-relaxed text-[#3D3944]">
                      {q.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Specific Writing Suggestions */}
      {activeAnnotations.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-bold tracking-wider text-[#552985] uppercase">
            Specific Writing Notes ({activeAnnotations.length})
          </h2>
          <div className="mt-2 space-y-2">
            {activeAnnotations.map((a, idx) => (
              <div
                key={a.id}
                className="rounded-lg border border-[#E7E1F0] bg-[#FBF9FD] p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#552985] uppercase">
                    {idx + 1}. {a.category}
                  </span>
                  <span className="text-[#AE97C5]">•</span>
                  <span className="italic text-[#3D3944]">
                    &ldquo;{a.quote}&rdquo;
                  </span>
                  {a.suggestedRevision && (
                    <span className="font-semibold text-[#552985]">
                      → &ldquo;{a.suggestedRevision}&rdquo;
                    </span>
                  )}
                </div>
                <p className="mt-1 leading-relaxed text-[#5D5E60]">
                  {a.teacherNote ? `${a.teacherNote} — ` : ""}
                  {a.explanation}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Student Work */}
      <section className="mt-5 border-t border-[#E3DAF0] pt-4">
        <h2 className="text-xs font-bold tracking-wider text-[#5D5E60] uppercase">
          Your Submitted Work
        </h2>
        <div className="font-serif-paper mt-2 whitespace-pre-wrap rounded-lg border border-[#EFEAF6] bg-[#FCFBFE] p-3.5 text-sm leading-relaxed text-[#2D2A32]">
          {submission.transcribedText}
        </div>
      </section>

      {/* Humane Teacher Sign-Off */}
      <footer className="mt-6 rounded-xl border border-[#DFD5EC] bg-[#F7F4FA] px-4 py-3">
        <p className="text-xs leading-relaxed text-[#3D3944]">
          Every assignment is a step forward in finding your voice as a writer
          and thinker. Be proud of what worked well here, and focus on just one
          or two improvements next time—I am always glad to talk through any
          question with you in class.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E3DAF0] pt-2 text-xs">
          <span className="font-semibold text-[#552985]">
            Warm regards, Mr. Ahmed Hamdy
          </span>
          <span className="text-[#5D5E60]">
            The Royal College International School (RCIS) • English Department
          </span>
        </div>
      </footer>
    </div>
  );
}
