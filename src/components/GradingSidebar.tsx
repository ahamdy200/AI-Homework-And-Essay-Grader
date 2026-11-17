"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  ThumbsUp,
} from "lucide-react";
import { clampScore, getEffectiveSubmissionGrade } from "@/lib/scoring";
import type {
  CriterionScore,
  Submission,
  SubmissionStatus,
} from "@/lib/types";

interface GradingSidebarProps {
  submission: Submission;
  sessionApiKey: string;
  onPatchSubmission: (patch: Partial<Submission>) => Promise<void>;
  onFollowUpResult: (updatedSubmission: Submission) => void;
}

const QUICK_PROMPTS = [
  "Write a short, supportive parent email summarizing this essay.",
  "Create 3 quick grammar practice sentences targeting this student's mistakes.",
  "Simplify the revision steps for a struggling reader.",
];

export function GradingSidebar({
  submission,
  sessionApiKey,
  onPatchSubmission,
  onFollowUpResult,
}: GradingSidebarProps) {
  const effective = getEffectiveSubmissionGrade(submission);

  const [commentDraft, setCommentDraft] = useState(
    submission.teacherFinalComment
  );
  const [commentDirty, setCommentDirty] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);

  const [overrideInput, setOverrideInput] = useState<string>(
    submission.teacherPercentageOverride !== null
      ? String(submission.teacherPercentageOverride)
      : ""
  );
  const [showOverrideEditor, setShowOverrideEditor] = useState(false);

  const [followUpInput, setFollowUpInput] = useState("");
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  useEffect(() => {
    setCommentDraft(submission.teacherFinalComment);
    setCommentDirty(false);
    setOverrideInput(
      submission.teacherPercentageOverride !== null
        ? String(submission.teacherPercentageOverride)
        : ""
    );
    setShowOverrideEditor(false);
    setFollowUpError(null);
  }, [
    submission.id,
    submission.teacherFinalComment,
    submission.teacherPercentageOverride,
  ]);

  const handleCriterionChange = async (
    criterionId: string,
    newTeacherScore: number | null
  ) => {
    const nextScores: CriterionScore[] = submission.criterionScores.map((c) =>
      c.criterionId === criterionId
        ? {
            ...c,
            teacherScore:
              newTeacherScore !== null
                ? clampScore(newTeacherScore, c.maxScore)
                : null,
          }
        : c
    );
    await onPatchSubmission({
      criterionScores: nextScores,
      status: submission.status === "ai_graded" ? "reviewed" : submission.status,
    });
  };

  const handleSaveComment = async () => {
    setIsSavingComment(true);
    try {
      await onPatchSubmission({
        teacherFinalComment: commentDraft,
        status:
          submission.status === "ai_graded" ? "reviewed" : submission.status,
      });
      setCommentDirty(false);
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleApplyOverride = async () => {
    const parsed = Number(overrideInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
    await onPatchSubmission({
      teacherPercentageOverride: Math.round(parsed * 10) / 10,
      status: submission.status === "ai_graded" ? "reviewed" : submission.status,
    });
    setShowOverrideEditor(false);
  };

  const handleClearOverride = async () => {
    await onPatchSubmission({
      teacherPercentageOverride: null,
      teacherLetterGradeOverride: null,
    });
    setOverrideInput("");
    setShowOverrideEditor(false);
  };

  const handleStatusChange = async (status: SubmissionStatus) => {
    await onPatchSubmission({ status });
  };

  const sendFollowUp = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || isAskingFollowUp) return;

    setFollowUpError(null);
    setIsAskingFollowUp(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionApiKey.trim()) {
        headers["x-gemini-api-key"] = sessionApiKey.trim();
      }

      const res = await fetch(`/api/submissions/${submission.id}/followup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: clean }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Follow-up request failed.");
      }
      setFollowUpInput("");
      if (json.submission) {
        onFollowUpResult(json.submission);
      }
    } catch (err) {
      setFollowUpError(
        err instanceof Error ? err.message : "Failed to ask follow-up question."
      );
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  return (
    <aside className="no-print workbench-scroll flex h-full flex-col overflow-y-auto border-l border-[#E3DAF0] bg-white">
      {/* Overall Grade & Status */}
      <div className="border-b border-[#E3DAF0] bg-[#F7F4FA]/75 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-[#5D5E60] uppercase">
              {effective.isOverridden ? "Teacher Final Grade" : "AI Suggested Grade"}
            </span>
            <div className="mt-1 flex items-baseline gap-2.5">
              <span className="font-mono-score text-3xl font-bold text-[#552985]">
                {effective.letterGrade}
              </span>
              <span className="font-mono-score text-lg font-semibold text-[#2D233D]">
                {effective.percentage}%
              </span>
              <span className="font-mono-score text-xs text-[#5D5E60]">
                ({effective.earned}/{effective.max} pts)
              </span>
            </div>
            {effective.isOverridden && (
              <p className="mt-1 text-[11px] text-[#5D5E60]">
                Original AI score: {submission.aiPercentage}% ({submission.aiLetterGrade})
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowOverrideEditor((v) => !v)}
            className="rounded-lg border border-[#DFD5EC] bg-white px-2.5 py-1 text-[11px] font-medium text-[#552985] hover:bg-[#F7F4FA]"
          >
            {showOverrideEditor ? "Close" : "Override %"}
          </button>
        </div>

        {showOverrideEditor && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#DFD5EC] bg-white p-2.5">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder="0–100"
              className="font-mono-score w-20 rounded-lg border border-[#DFD5EC] px-2.5 py-1 text-xs outline-none focus:border-[#552985]"
            />
            <button
              type="button"
              onClick={handleApplyOverride}
              className="rounded-lg bg-[#552985] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#633C8D]"
            >
              Apply %
            </button>
            {submission.teacherPercentageOverride !== null && (
              <button
                type="button"
                onClick={handleClearOverride}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DFD5EC] px-2 py-1 text-xs text-[#5D5E60] hover:bg-[#F7F4FA]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        )}

        {/* Workflow Status */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-[#DFD5EC] bg-white p-1">
          {(
            [
              { id: "ai_graded", label: "AI Graded" },
              { id: "reviewed", label: "Reviewed" },
              { id: "finalized", label: "Finalized" },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => handleStatusChange(st.id)}
              className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${
                submission.status === st.id
                  ? st.id === "finalized"
                    ? "bg-[#552985] text-white"
                    : "bg-[#2D233D] text-white"
                  : "text-[#5D5E60] hover:bg-[#F7F4FA]"
              }`}
            >
              {submission.status === st.id && st.id === "finalized" && (
                <CheckCircle2 className="h-3 w-3" />
              )}
              <span>{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 p-5">
        {/* Rubric Breakdown */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-[#552985] uppercase">
              Rubric Scorecard
            </h3>
            <span className="text-[11px] text-[#5D5E60]">
              Adjust any criterion score
            </span>
          </div>

          <div className="space-y-3">
            {submission.criterionScores.map((c) => {
              const effectiveScore =
                c.teacherScore !== null ? c.teacherScore : c.score;
              const pct = Math.round((effectiveScore / c.maxScore) * 100);
              return (
                <div
                  key={c.criterionId}
                  className="rounded-xl border border-[#E3DAF0] bg-[#FBF9FD] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#2D233D]">
                      {c.criterionName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={c.maxScore}
                        step={0.5}
                        value={effectiveScore}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (Number.isFinite(val)) {
                            handleCriterionChange(c.criterionId, val);
                          }
                        }}
                        className="font-mono-score w-14 rounded-md border border-[#DFD5EC] bg-white px-1.5 py-0.5 text-right text-xs font-semibold text-[#2D233D] outline-none focus:border-[#552985]"
                        aria-label={`${c.criterionName} score`}
                      />
                      <span className="font-mono-score text-xs text-[#5D5E60]">
                        / {c.maxScore}
                      </span>
                      {c.teacherScore !== null && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCriterionChange(c.criterionId, null)
                          }
                          className="text-[#997FBC] hover:text-[#552985]"
                          title={`Reset to AI score (${c.score})`}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E3DAF0]">
                    <div
                      className="h-full rounded-full bg-[#552985] transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-[#5D5E60]">
                    {c.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Strengths & Priority Next Steps */}
        <section className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-[#DFD5EC] border-l-4 border-l-[#552985] bg-[#F7F4FA]/85 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#552985]">
              <ThumbsUp className="h-3.5 w-3.5" />
              <span>What Worked Well</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#2D2A32]">
              {submission.strengths.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[#E3DAF0] border-l-4 border-l-[#997FBC] bg-white p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#633C8D]">
              <Target className="h-3.5 w-3.5" />
              <span>Where to Grow Next</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#2D2A32]">
              {submission.priorityNextSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Teacher Final Comment */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold tracking-wider text-[#552985] uppercase">
              Teacher Final Comment
            </label>
            {commentDirty && (
              <span className="text-[11px] font-medium text-[#7F5FA8]">
                Unsaved edits
              </span>
            )}
          </div>
          <textarea
            rows={4}
            value={commentDraft}
            onChange={(e) => {
              setCommentDraft(e.target.value);
              setCommentDirty(true);
            }}
            className="w-full rounded-xl border border-[#DFD5EC] bg-[#FBF9FD] p-3 text-xs leading-relaxed text-[#2D2A32] outline-none focus:border-[#552985] focus:bg-white"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!commentDirty || isSavingComment}
              onClick={handleSaveComment}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#552985] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#633C8D] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSavingComment ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span>Save Comment</span>
            </button>
          </div>
        </section>

        {/* Stateful Teacher Follow-Up Assistant */}
        <section className="border-t border-[#E3DAF0] pt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[#2D233D] uppercase">
              <MessageSquareText className="h-3.5 w-3.5 text-[#552985]" />
              <span>Teacher Co-Pilot</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] text-[#5D5E60]">
              <Sparkles className="h-3 w-3 text-[#7F5FA8]" />
              Stateful Context
            </span>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isAskingFollowUp}
                onClick={() => sendFollowUp(q)}
                className="rounded-lg border border-[#DFD5EC] bg-[#F7F4FA] px-2.5 py-1 text-left text-[11px] font-medium text-[#2D2A32] transition hover:border-[#552985] hover:bg-[#EFE9F8] disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {submission.followUps.length > 0 && (
            <div className="mb-3 max-h-64 space-y-2.5 overflow-y-auto rounded-xl border border-[#DFD5EC] bg-[#FBF9FD] p-3">
              {submission.followUps.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                    msg.role === "teacher"
                      ? "ml-4 bg-[#552985] text-white"
                      : "mr-2 border border-[#E3DAF0] bg-white text-[#2D2A32] whitespace-pre-wrap"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
            </div>
          )}

          {followUpError && (
            <p className="mb-2 text-xs text-red-700">{followUpError}</p>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendFollowUp(followUpInput);
                }
              }}
              placeholder="Ask Gemini to adapt feedback, make drills..."
              className="flex-1 rounded-xl border border-[#DFD5EC] bg-[#FBF9FD] px-3 py-2 text-xs text-[#2D233D] outline-none focus:border-[#552985] focus:bg-white"
            />
            <button
              type="button"
              disabled={!followUpInput.trim() || isAskingFollowUp}
              onClick={() => sendFollowUp(followUpInput)}
              className="inline-flex items-center justify-center rounded-xl bg-[#552985] px-3 text-white transition hover:bg-[#633C8D] disabled:opacity-50"
              aria-label="Send follow-up question"
            >
              {isAskingFollowUp ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
