"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Columns2,
  Eye,
  FileImage,
  FileText,
  Highlighter,
  KeyRound,
  ListChecks,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { alignAnnotationsToText } from "@/lib/annotations";
import { summarizeQuestionResults } from "@/lib/mcq";
import type {
  AnnotationCategory,
  AnnotationItem,
  Assignment,
  QuestionResult,
  Submission,
} from "@/lib/types";

interface AnnotatedPaperProps {
  submission: Submission;
  assignment?: Assignment;
  onUpdateAnnotations: (annotations: AnnotationItem[]) => void;
  onUpdateQuestionResults?: (questionResults: QuestionResult[]) => void;
}

const CATEGORY_STYLES: Record<
  AnnotationCategory,
  {
    label: string;
    highlight: string;
    badge: string;
    border: string;
  }
> = {
  grammar: {
    label: "Grammar",
    highlight: "bg-red-100/90 border-b-2 border-red-500 text-stone-900",
    badge: "bg-red-50 text-red-800 border-red-200",
    border: "border-l-red-500",
  },
  spelling: {
    label: "Spelling",
    highlight: "bg-rose-100/90 border-b-2 border-rose-500 text-stone-900",
    badge: "bg-rose-50 text-rose-800 border-rose-200",
    border: "border-l-rose-500",
  },
  punctuation: {
    label: "Punctuation",
    highlight: "bg-orange-100/90 border-b-2 border-orange-500 text-stone-900",
    badge: "bg-orange-50 text-orange-800 border-orange-200",
    border: "border-l-orange-500",
  },
  clarity: {
    label: "Clarity",
    highlight: "bg-indigo-100/80 border-b-2 border-indigo-500 text-stone-900",
    badge: "bg-indigo-50 text-indigo-800 border-indigo-200",
    border: "border-l-indigo-500",
  },
  vocabulary: {
    label: "Vocabulary",
    highlight: "bg-sky-100/80 border-b-2 border-sky-500 text-stone-900",
    badge: "bg-sky-50 text-sky-800 border-sky-200",
    border: "border-l-sky-500",
  },
  structure: {
    label: "Structure",
    highlight: "bg-amber-100/90 border-b-2 border-amber-500 text-stone-900",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    border: "border-l-amber-500",
  },
  praise: {
    label: "Strength",
    highlight: "bg-emerald-100/80 border-b-2 border-emerald-600 text-stone-900",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    border: "border-l-emerald-600",
  },
};

export function AnnotatedPaper({
  submission,
  assignment,
  onUpdateAnnotations,
  onUpdateQuestionResults,
}: AnnotatedPaperProps) {
  const [viewMode, setViewMode] = useState<"annotated" | "compare" | "plain">(
    "annotated"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(
    submission.annotations[0]?.id ?? null
  );
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showMediaPanel, setShowMediaPanel] = useState(
    submission.attachments.length > 0
  );
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const questionResults = useMemo(
    () => submission.questionResults ?? [],
    [submission.questionResults]
  );
  const questionSummary = useMemo(
    () => summarizeQuestionResults(questionResults),
    [questionResults]
  );

  const handleToggleMcq = (targetId: string, markCorrect: boolean) => {
    if (!onUpdateQuestionResults) return;
    const next = questionResults.map((q) => {
      if (q.id !== targetId) return q;
      return {
        ...q,
        status: (markCorrect
          ? "correct"
          : "incorrect") as QuestionResult["status"],
        teacherPoints: markCorrect ? q.maxPoints : 0,
      };
    });
    onUpdateQuestionResults(next);
  };

  const handleAdjustQuestionPoints = (targetId: string, rawVal: number) => {
    if (!onUpdateQuestionResults || !Number.isFinite(rawVal)) return;
    const next = questionResults.map((q) => {
      if (q.id !== targetId) return q;
      const clamped =
        Math.round(Math.max(0, Math.min(q.maxPoints, rawVal)) * 10) / 10;
      const status: QuestionResult["status"] =
        clamped >= q.maxPoints
          ? "correct"
          : clamped > 0
            ? "partial"
            : "incorrect";
      return {
        ...q,
        status,
        teacherPoints: clamped,
      };
    });
    onUpdateQuestionResults(next);
  };

  const handleResetQuestion = (targetId: string) => {
    if (!onUpdateQuestionResults) return;
    const next = questionResults.map((q) => {
      if (q.id !== targetId) return q;
      const status: QuestionResult["status"] =
        q.pointsEarned >= q.maxPoints
          ? "correct"
          : q.pointsEarned > 0
            ? "partial"
            : q.studentAnswer.toLowerCase() === "unanswered"
              ? "missing"
              : "incorrect";
      return {
        ...q,
        status,
        teacherPoints: null,
      };
    });
    onUpdateQuestionResults(next);
  };

  const answerKeyText =
    submission.modelAnswerText?.trim() ||
    assignment?.modelAnswerText?.trim() ||
    "";
  const answerKeyAttachments =
    submission.modelAnswerAttachments &&
    submission.modelAnswerAttachments.length > 0
      ? submission.modelAnswerAttachments
      : assignment?.modelAnswerAttachments || [];
  const hasAnswerKey =
    answerKeyText.length > 0 || answerKeyAttachments.length > 0;

  const visibleAnnotations = useMemo(() => {
    return submission.annotations.filter((ann) => {
      if (categoryFilter === "all") return true;
      return ann.category === categoryFilter;
    });
  }, [submission.annotations, categoryFilter]);

  const alignment = useMemo(() => {
    const activeForInline = visibleAnnotations.filter(
      (a) => a.status !== "dismissed"
    );
    return alignAnnotationsToText(submission.transcribedText, activeForInline);
  }, [submission.transcribedText, visibleAnnotations]);

  const handleSetStatus = (
    annId: string,
    status: "pending" | "accepted" | "dismissed"
  ) => {
    const updated = submission.annotations.map((ann) =>
      ann.id === annId ? { ...ann, status } : ann
    );
    onUpdateAnnotations(updated);
  };

  const handleSaveTeacherNote = (annId: string) => {
    const updated = submission.annotations.map((ann) =>
      ann.id === annId
        ? { ...ann, teacherNote: noteDraft.trim(), status: "accepted" as const }
        : ann
    );
    onUpdateAnnotations(updated);
    setEditingNoteId(null);
    setNoteDraft("");
  };

  const counts = useMemo(() => {
    const issues = submission.annotations.filter(
      (a) => a.category !== "praise" && a.status !== "dismissed"
    ).length;
    const praise = submission.annotations.filter(
      (a) => a.category === "praise" && a.status !== "dismissed"
    ).length;
    const accepted = submission.annotations.filter(
      (a) => a.status === "accepted"
    ).length;
    return { issues, praise, accepted };
  }, [submission.annotations]);

  const handleSelectAnnotation = (annId: string) => {
    setSelectedAnnId(annId);
    const el = document.getElementById(`ann-card-${annId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="workbench-scroll flex h-full flex-col overflow-y-auto bg-[#FAF8F4]/50">
      {/* Paper Top Header */}
      <div className="sticky top-0 z-10 border-b border-[#E6DFD2] bg-[#FAF8F4]/95 px-5 py-3.5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif-paper truncate text-xl font-semibold text-stone-900">
                {submission.detectedTitle || assignment?.title || "Student Paper"}
              </h2>
              <span className="rounded-md border border-[#E6DFD2] bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">
                {submission.wordCount} words
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              {submission.studentName}
              {submission.studentIdCode ? ` (${submission.studentIdCode})` : ""}
              {assignment ? ` • ${assignment.title}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasAnswerKey && (
              <button
                type="button"
                onClick={() => setShowAnswerKey((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showAnswerKey
                    ? "border-[#1F5E4B] bg-emerald-50 text-emerald-900"
                    : "border-[#E6DFD2] bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{showAnswerKey ? "Hide Answer Key" : "Answer Key"}</span>
              </button>
            )}

            {submission.attachments.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMediaPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showMediaPanel
                    ? "border-[#1F5E4B] bg-emerald-50 text-emerald-900"
                    : "border-[#E6DFD2] bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <FileImage className="h-3.5 w-3.5" />
                <span>
                  {showMediaPanel ? "Hide Scans" : "View Original Scan"} (
                  {submission.attachments.length})
                </span>
              </button>
            )}

            <div className="inline-flex rounded-lg border border-[#E6DFD2] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("annotated")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === "annotated"
                    ? "bg-[#1F5E4B] text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Highlighter className="h-3.5 w-3.5" />
                <span>Annotated</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compare")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === "compare"
                    ? "bg-[#1F5E4B] text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>Revised Compare</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plain")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === "plain"
                    ? "bg-[#1F5E4B] text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Clean Text</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Bar */}
        {viewMode === "annotated" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                  categoryFilter === "all"
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 border border-[#E6DFD2] hover:bg-stone-50"
                }`}
              >
                All ({submission.annotations.length})
              </button>
              {(Object.keys(CATEGORY_STYLES) as AnnotationCategory[]).map(
                (cat) => {
                  const count = submission.annotations.filter(
                    (a) => a.category === cat
                  ).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                        categoryFilter === cat
                          ? "border-stone-900 bg-stone-900 text-white"
                          : `${CATEGORY_STYLES[cat].badge} hover:opacity-85`
                      }`}
                    >
                      {CATEGORY_STYLES[cat].label} ({count})
                    </button>
                  );
                }
              )}
            </div>

            <div className="text-[11px] text-stone-500">
              {counts.issues} notes • {counts.praise} praise • {counts.accepted}{" "}
              teacher-confirmed
            </div>
          </div>
        )}
      </div>

      {/* Main Reading & Review Content */}
      <div className="mx-auto w-full max-w-4xl space-y-6 p-5 sm:p-7">
        {/* Optional Teacher's Model Answer / Answer Key Reference */}
        {showAnswerKey && hasAnswerKey && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-emerald-900 uppercase">
                <KeyRound className="h-3.5 w-3.5 text-[#1F5E4B]" />
                Teacher&apos;s Model Answer / Answer Key
              </span>
              <span className="text-[11px] text-stone-500">
                Used as grading reference
              </span>
            </div>
            {answerKeyText && (
              <div className="rounded-xl border border-emerald-200/80 bg-white p-3 text-xs leading-relaxed text-stone-800 whitespace-pre-wrap">
                {answerKeyText}
              </div>
            )}
            {answerKeyAttachments.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {answerKeyAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="overflow-hidden rounded-xl border border-[#E6DFD2] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#E6DFD2] px-3 py-1.5 text-xs text-stone-600">
                      <span className="truncate font-medium">
                        {att.originalName}
                      </span>
                      <a
                        href={att.urlPath}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-medium text-[#1F5E4B] hover:underline"
                      >
                        Open
                      </a>
                    </div>
                    {att.mimeType === "application/pdf" ? (
                      <iframe
                        src={att.urlPath}
                        title={att.originalName}
                        className="h-64 w-full bg-white"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.urlPath}
                        alt={att.originalName}
                        className="max-h-72 w-full object-contain bg-stone-900/5"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Optional Side-by-Side Original Handwritten Photo / PDF Viewer */}
        {showMediaPanel && submission.attachments.length > 0 && (
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
                Uploaded Student Homework ({submission.attachments.length})
              </span>
              <span className="text-[11px] text-stone-500">
                Transcribed verbatim below by Gemini 3.8 Flash
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {submission.attachments.map((att) => (
                <div
                  key={att.id}
                  className="overflow-hidden rounded-xl border border-[#E6DFD2] bg-[#FAF8F4]"
                >
                  <div className="flex items-center justify-between border-b border-[#E6DFD2] px-3 py-1.5 text-xs text-stone-600">
                    <span className="truncate font-medium">
                      {att.originalName}
                    </span>
                    <a
                      href={att.urlPath}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 font-medium text-[#1F5E4B] hover:underline"
                    >
                      Open
                    </a>
                  </div>
                  {att.mimeType === "application/pdf" ? (
                    <iframe
                      src={att.urlPath}
                      title={att.originalName}
                      className="h-72 w-full bg-white"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.urlPath}
                      alt={att.originalName}
                      className="max-h-96 w-full object-contain bg-stone-900/5"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quiz & Question Auto-Correction Card */}
        {questionResults.length > 0 && (
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4 shadow-2xs sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[#1F5E4B]" />
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    Quiz &amp; Question Auto-Correction
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Objective MCQs are case-insensitive; open/essay questions link directly to rubric &amp; inline paper edits below.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {questionSummary.mcqTotal > 0 && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-900">
                    MCQs: {questionSummary.mcqCorrect}/{questionSummary.mcqTotal} correct ({questionSummary.mcqEarned}/{questionSummary.mcqMax} pts)
                  </span>
                )}
                {questionSummary.openTotal > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-900">
                    Open/Essay Qs: {questionSummary.openEarned}/{questionSummary.openMax} pts
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              {questionResults.map((q) => {
                const effectivePts =
                  q.teacherPoints !== null ? q.teacherPoints : q.pointsEarned;
                const isCorrect = q.status === "correct";
                const isPartial = q.status === "partial";
                const cardBorder = isCorrect
                  ? "border-emerald-200 bg-emerald-50/35"
                  : isPartial
                    ? "border-amber-200 bg-amber-50/35"
                    : "border-red-200 bg-red-50/35";

                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-3 text-xs ${cardBorder}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-6 items-center rounded-md bg-stone-900 px-2 font-mono text-[11px] font-bold text-white">
                          Q{q.questionNumber}
                        </span>
                        <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                          {q.questionType === "mcq"
                            ? "MCQ"
                            : q.questionType === "short_answer"
                              ? "Short Answer"
                              : "Essay"}
                        </span>
                        <span className="font-semibold text-stone-800">
                          {q.promptOrTopic}
                        </span>
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Correct
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                            Partial Credit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                            <XCircle className="h-3.5 w-3.5" />
                            {q.status === "missing" ? "Missing" : "Incorrect"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {q.questionType === "mcq" && onUpdateQuestionResults ? (
                          <>
                            <span className="mr-1 font-mono text-[11px] font-semibold text-stone-700">
                              {effectivePts}/{q.maxPoints} pts
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleMcq(q.id, true)}
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                                isCorrect
                                  ? "border-emerald-700 bg-emerald-700 text-white"
                                  : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                              }`}
                            >
                              Mark Correct
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleMcq(q.id, false)}
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                                !isCorrect
                                  ? "border-red-700 bg-red-700 text-white"
                                  : "border-red-200 bg-white text-red-800 hover:bg-red-50"
                              }`}
                            >
                              Mark Wrong
                            </button>
                          </>
                        ) : q.questionType !== "mcq" &&
                          onUpdateQuestionResults ? (
                          <label className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-700">
                            <span>Score:</span>
                            <input
                              type="number"
                              min={0}
                              max={q.maxPoints}
                              step="0.5"
                              value={effectivePts}
                              onChange={(e) =>
                                handleAdjustQuestionPoints(
                                  q.id,
                                  Number(e.target.value)
                                )
                              }
                              className="w-16 rounded-md border border-[#E6DFD2] bg-white px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-stone-900 outline-none focus:border-[#1F5E4B]"
                            />
                            <span className="text-stone-500">
                              / {q.maxPoints}
                            </span>
                          </label>
                        ) : (
                          <span className="font-mono text-[11px] font-semibold text-stone-700">
                            {effectivePts}/{q.maxPoints} pts
                          </span>
                        )}

                        {q.teacherPoints !== null && onUpdateQuestionResults && (
                          <button
                            type="button"
                            onClick={() => handleResetQuestion(q.id)}
                            title="Reset to AI/Key grade"
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 hover:bg-stone-50"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                          Student Answer:{" "}
                        </span>
                        <span className="font-mono font-semibold text-stone-900">
                          {q.studentAnswer || "Unanswered"}
                        </span>
                      </div>
                      <div className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                          Expected / Key:{" "}
                        </span>
                        <span className="font-mono font-semibold text-emerald-900">
                          {q.expectedAnswer || "Rubric evaluated"}
                        </span>
                      </div>
                    </div>

                    {q.explanation && (
                      <p className="mt-2 leading-relaxed text-stone-700">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Essay Paper Sheet */}
        {viewMode === "compare" ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#E6DFD2] bg-white p-6 shadow-xs">
              <div className="mb-3 flex items-center gap-2 border-b border-[#E6DFD2] pb-2.5 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                <FileText className="h-3.5 w-3.5" />
                <span>Original Student Draft</span>
              </div>
              <div className="font-serif-paper whitespace-pre-wrap text-[16px] leading-[1.85] text-stone-800">
                {submission.transcribedText}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-xs">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-2.5 text-xs font-semibold tracking-wider text-emerald-800 uppercase">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Suggested Clean Revision</span>
              </div>
              <div className="font-serif-paper whitespace-pre-wrap text-[16px] leading-[1.85] text-stone-900">
                {submission.revisedDraft}
              </div>
            </div>
          </div>
        ) : (
          <article className="rounded-2xl border border-[#E6DFD2] bg-white px-6 py-7 shadow-sm sm:px-10 sm:py-9">
            <div className="font-serif-paper whitespace-pre-wrap text-[17px] leading-[1.9] text-stone-900">
              {viewMode === "plain"
                ? submission.transcribedText
                : alignment.segments.map((seg, idx) => {
                    if (seg.type === "text" || !seg.annotation) {
                      return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
                    }
                    const style = CATEGORY_STYLES[seg.annotation.category];
                    const isSelected = selectedAnnId === seg.annotation.id;
                    return (
                      <button
                        key={seg.annotation.id}
                        type="button"
                        onClick={() =>
                          handleSelectAnnotation(seg.annotation!.id)
                        }
                        className={`inline cursor-pointer rounded-xs px-0.5 text-left transition ${
                          style.highlight
                        } ${
                          isSelected
                            ? "ring-2 ring-stone-900 ring-offset-1"
                            : "hover:brightness-95"
                        }`}
                        title={`${style.label}: ${seg.annotation.explanation}`}
                      >
                        {seg.text}
                      </button>
                    );
                  })}
            </div>
          </article>
        )}

        {/* Inline Annotation Review Cards */}
        {viewMode === "annotated" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
                Line-by-Line Markups &amp; Teacher Review (
                {visibleAnnotations.length})
              </h3>
              <span className="text-[11px] text-stone-500">
                Click any highlight above to jump to its card
              </span>
            </div>

            {visibleAnnotations.length === 0 ? (
              <div className="rounded-xl border border-[#E6DFD2] bg-white p-5 text-center text-xs text-stone-500">
                No annotations match this filter.
              </div>
            ) : (
              <div className="space-y-2.5">
                {visibleAnnotations.map((ann) => {
                  const style = CATEGORY_STYLES[ann.category];
                  const isSelected = selectedAnnId === ann.id;
                  const isDismissed = ann.status === "dismissed";
                  const isUnanchored = alignment.unanchored.some(
                    (u) => u.id === ann.id
                  );

                  return (
                    <div
                      key={ann.id}
                      id={`ann-card-${ann.id}`}
                      onClick={() => setSelectedAnnId(ann.id)}
                      className={`rounded-xl border border-l-4 bg-white p-4 transition ${
                        style.border
                      } ${
                        isSelected
                          ? "border-stone-400 shadow-sm ring-1 ring-stone-300"
                          : "border-[#E6DFD2]"
                      } ${isDismissed ? "opacity-55" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}
                          >
                            {style.label}
                          </span>
                          {ann.status === "accepted" && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              <Check className="h-3 w-3" />
                              Teacher Confirmed
                            </span>
                          )}
                          {isDismissed && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                              Dismissed
                            </span>
                          )}
                          {isUnanchored && !isDismissed && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
                              General Note
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {ann.status !== "accepted" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStatus(ann.id, "accepted");
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E6DFD2] px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
                              title="Confirm this markup"
                            >
                              <Check className="h-3 w-3" />
                              <span>Confirm</span>
                            </button>
                          )}

                          {ann.status !== "dismissed" ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStatus(ann.id, "dismissed");
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E6DFD2] px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100"
                              title="Dismiss this AI suggestion"
                            >
                              <X className="h-3 w-3" />
                              <span>Dismiss</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStatus(ann.id, "pending");
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E6DFD2] px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Restore</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingNoteId(
                                editingNoteId === ann.id ? null : ann.id
                              );
                              setNoteDraft(ann.teacherNote);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[#E6DFD2] px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                            title="Add teacher note"
                          >
                            <MessageSquarePlus className="h-3 w-3" />
                            <span>Note</span>
                          </button>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-baseline gap-2 text-sm">
                        <span
                          className={`rounded bg-stone-100 px-1.5 py-0.5 font-serif-paper ${
                            ann.suggestedRevision && !isDismissed
                              ? "line-through decoration-red-400 text-stone-600"
                              : "text-stone-900"
                          }`}
                        >
                          &ldquo;{ann.quote}&rdquo;
                        </span>
                        {ann.suggestedRevision && (
                          <>
                            <span className="text-stone-400">→</span>
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-serif-paper font-semibold text-emerald-900">
                              &ldquo;{ann.suggestedRevision}&rdquo;
                            </span>
                          </>
                        )}
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-stone-700">
                        {ann.explanation}
                      </p>

                      {ann.teacherNote && editingNoteId !== ann.id && (
                        <div className="mt-2 rounded-lg bg-[#FAF8F4] px-3 py-2 text-xs text-stone-800">
                          <span className="font-semibold text-[#1F5E4B]">
                            Teacher Note:{" "}
                          </span>
                          {ann.teacherNote}
                        </div>
                      )}

                      {editingNoteId === ann.id && (
                        <div
                          className="mt-2.5 flex gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Add custom teacher guidance for the student..."
                            className="flex-1 rounded-lg border border-[#E6DFD2] px-2.5 py-1.5 text-xs outline-none focus:border-[#1F5E4B]"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTeacherNote(ann.id)}
                            className="rounded-lg bg-[#1F5E4B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#174839]"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
