"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface AnswerKeyEntry {
  questionNumber: number;
  type: "mcq" | "essay";
  correctAnswer: string;
  points: number;
}

interface GradingResultItem {
  questionNumber: number;
  studentAnswer: string;
  status: "correct" | "incorrect" | "partial" | "missing";
  pointsEarned: number;
  maxPoints: number;
  explanation: string;
}

interface GradingResult {
  transcribedText: string;
  results: GradingResultItem[];
  totalScore: number;
  maxScore: number;
  percentage: number;
  summaryFeedback: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function emptyEntry(n: number): AnswerKeyEntry {
  return { questionNumber: n, type: "mcq", correctAnswer: "", points: 1 };
}

function gradeColor(pct: number): string {
  if (pct >= 90) return "text-[#552985]";
  if (pct >= 80) return "text-[#7F5FA8]";
  if (pct >= 70) return "text-amber-700";
  if (pct >= 60) return "text-orange-700";
  return "text-red-700";
}

function gradeBg(pct: number): string {
  if (pct >= 90) return "bg-[#F7F4FA] border-[#C8B9DE]";
  if (pct >= 80) return "bg-[#FAF7FD] border-[#E3DAF0]";
  if (pct >= 70) return "bg-amber-50 border-amber-200";
  if (pct >= 60) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function statusIcon(status: string) {
  switch (status) {
    case "correct":
      return <CheckCircle2 className="h-4 w-4 text-[#552985]" />;
    case "incorrect":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "partial":
      return <CheckCircle2 className="h-4 w-4 text-amber-500" />;
    case "missing":
      return <XCircle className="h-4 w-4 text-stone-400" />;
    default:
      return null;
  }
}

function letterGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A−";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B−";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C−";
  if (pct >= 67) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function QuickGradeClient({
  initialEnvConfigured,
}: {
  initialEnvConfigured: boolean;
}) {
  // API key
  const [sessionKey, setSessionKey] = useState("");
  const configured = initialEnvConfigured || sessionKey.trim().length > 0;

  // Answer key state — start with 25 blank MCQ rows
  const [entries, setEntries] = useState<AnswerKeyEntry[]>(() =>
    Array.from({ length: 25 }, (_, i) => emptyEntry(i + 1))
  );

  // Image uploads
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Student name
  const [studentName, setStudentName] = useState("");

  // Grading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);

  // UI toggles
  const [showTranscription, setShowTranscription] = useState(false);
  const [showKeyEditor, setShowKeyEditor] = useState(true);

  // ---- Answer key handlers ----

  const updateEntry = useCallback(
    (idx: number, patch: Partial<AnswerKeyEntry>) => {
      setEntries((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...patch };
        return copy;
      });
    },
    []
  );

  const addQuestion = useCallback(() => {
    setEntries((prev) => {
      if (prev.length >= 25) return prev;
      return [...prev, emptyEntry(prev.length + 1)];
    });
  }, []);

  const removeQuestion = useCallback((idx: number) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((_, i) => i !== idx)
        .map((e, i) => ({ ...e, questionNumber: i + 1 }));
    });
  }, []);

  // ---- File handlers ----

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter((f) =>
      /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf)$/.test(f.type)
    );
    setFiles((prev) => [...prev, ...accepted]);
    for (const f of accepted) {
      if (f.type.startsWith("image/")) {
        const url = URL.createObjectURL(f);
        setPreviews((prev) => [...prev, url]);
      } else {
        setPreviews((prev) => [...prev, ""]);
      }
    }
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // ---- Submit ----

  const handleGrade = useCallback(async () => {
    setError(null);
    setResult(null);

    // Validate at least one filled answer
    const filled = entries.filter((e) => e.correctAnswer.trim());
    if (filled.length === 0) {
      setError("Enter at least one answer in the answer key.");
      return;
    }
    if (files.length === 0) {
      setError("Upload at least one homework image.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        answerKey: filled.map((e) => ({
          questionNumber: e.questionNumber,
          type: e.type,
          correctAnswer: e.correctAnswer.trim(),
          points: e.points,
        })),
        studentName: studentName.trim() || "Student",
      };

      const form = new FormData();
      form.append("answerKey", JSON.stringify(payload));
      for (const f of files) {
        form.append("images", f);
      }

      const headers: Record<string, string> = {};
      if (sessionKey.trim()) {
        headers["x-gemini-api-key"] = sessionKey.trim();
      }

      const res = await fetch("/api/quick-grade", {
        method: "POST",
        headers,
        body: form,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Server error (${res.status})`);
        return;
      }

      setResult(json.result as GradingResult);
      setShowKeyEditor(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [entries, files, sessionKey, studentName]);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setFiles([]);
    setPreviews([]);
    setShowKeyEditor(true);
  }, []);

  // ---- Render ----

  return (
    <div className="min-h-screen bg-[#F7F5FA]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#DFD5EC] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-[#5D5E60] transition hover:text-[#552985]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-medium hidden sm:inline">
                Back to Workbench
              </span>
            </Link>
            <div className="h-5 w-px bg-[#E3DAF0]" />
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/rcis-logo.png"
                alt="The Royal College International School"
                className="h-9 w-9 shrink-0 rounded-lg border border-[#E3DAF0] bg-white object-contain p-0.5"
              />
              <div>
                <h1 className="font-serif text-lg font-semibold tracking-tight text-[#552985] leading-tight">
                  Quick Grade
                </h1>
                <p className="text-[10px] font-medium text-[#5D5E60]">
                  Mr. Ahmed Hamdy • Fast Answer-Key Scanner
                </p>
              </div>
            </div>
          </div>

          {/* API key indicator */}
          <div className="flex items-center gap-2">
            {!configured && (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Gemini API key"
                  value={sessionKey}
                  onChange={(e) => setSessionKey(e.target.value)}
                  className="w-48 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-[#2D233D] placeholder:text-amber-600/60 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                configured
                  ? "border-[#DFD5EC] bg-[#F7F4FA] text-[#552985]"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              {configured ? (
                <CheckCircle2 className="h-3 w-3 text-[#7F5FA8]" />
              ) : (
                <KeyRound className="h-3 w-3" />
              )}
              {configured ? "API Ready" : "Need Key"}
            </span>
          </div>
        </div>
        <div className="grid h-1 w-full grid-cols-4">
          <div className="bg-[#552985]" />
          <div className="bg-[#7F5FA8]" />
          <div className="bg-[#997FBC]" />
          <div className="bg-[#AE97C5]" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Results banner */}
        {result && (
          <div className={`mb-6 rounded-xl border-2 p-6 ${gradeBg(result.percentage)}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className={`text-4xl font-bold ${gradeColor(result.percentage)}`}>
                    {Math.round(result.percentage)}%
                  </span>
                  <span className={`text-2xl font-semibold ${gradeColor(result.percentage)}`}>
                    {letterGrade(result.percentage)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#5D5E60]">
                  {result.totalScore} / {result.maxScore} points
                  {studentName.trim() ? ` — ${studentName.trim()}` : ""}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 border border-[#E3DAF0] px-3 py-1.5 text-xs font-medium text-[#2D233D] hover:bg-white transition"
              >
                <Camera className="h-3.5 w-3.5 text-[#552985]" />
                Grade Another
              </button>
            </div>
            <p className="mt-3 text-sm text-[#2D233D] leading-relaxed">
              {result.summaryFeedback}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Answer Key */}
          <div className="space-y-4">
            <button
              onClick={() => setShowKeyEditor(!showKeyEditor)}
              className="flex w-full items-center justify-between rounded-lg bg-white border border-[#E3DAF0] px-4 py-3 text-left shadow-xs hover:bg-[#F7F4FA]/50 transition"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#552985]" />
                <span className="text-sm font-semibold text-[#2D233D]">
                  Answer Key
                </span>
                <span className="text-xs text-[#5D5E60]">
                  ({entries.filter((e) => e.correctAnswer.trim()).length} of{" "}
                  {entries.length} filled)
                </span>
              </div>
              {showKeyEditor ? (
                <ChevronUp className="h-4 w-4 text-[#7F5FA8]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#7F5FA8]" />
              )}
            </button>

            {showKeyEditor && (
              <div className="rounded-xl border border-[#E3DAF0] bg-white shadow-xs overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#EFE9F8]">
                  {entries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-[#F7F4FA]/60"
                    >
                      {/* Number */}
                      <span className="w-7 text-center text-xs font-bold text-[#7F5FA8]">
                        {entry.questionNumber}
                      </span>

                      {/* Type toggle */}
                      <select
                        value={entry.type}
                        onChange={(e) =>
                          updateEntry(idx, {
                            type: e.target.value as "mcq" | "essay",
                            correctAnswer: "",
                            points: e.target.value === "mcq" ? 1 : 5,
                          })
                        }
                        className="rounded border border-[#E3DAF0] bg-[#F7F5FA] px-2 py-1 text-xs text-[#2D233D] focus:border-[#552985] focus:outline-none"
                      >
                        <option value="mcq">MCQ</option>
                        <option value="essay">Essay</option>
                      </select>

                      {/* Answer input */}
                      {entry.type === "mcq" ? (
                        <div className="flex gap-1">
                          {["A", "B", "C", "D"].map((letter) => (
                            <button
                              key={letter}
                              type="button"
                              onClick={() =>
                                updateEntry(idx, {
                                  correctAnswer:
                                    entry.correctAnswer === letter
                                      ? ""
                                      : letter,
                                })
                              }
                              className={`h-7 w-7 rounded-md text-xs font-semibold transition ${
                                entry.correctAnswer === letter
                                  ? "bg-[#552985] text-white shadow-sm"
                                  : "bg-[#F7F4FA] text-[#5D5E60] hover:bg-[#EFE9F8] hover:text-[#552985]"
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={entry.correctAnswer}
                          onChange={(e) =>
                            updateEntry(idx, { correctAnswer: e.target.value })
                          }
                          placeholder="Model answer…"
                          className="flex-1 min-w-0 rounded-lg border border-[#E3DAF0] px-2.5 py-1 text-xs text-[#2D233D] placeholder:text-[#8E8A96] focus:border-[#552985] focus:outline-none"
                        />
                      )}

                      {/* Points */}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={entry.points}
                        onChange={(e) =>
                          updateEntry(idx, {
                            points: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-12 rounded border border-[#E3DAF0] bg-[#F7F5FA] px-1.5 py-1 text-center text-xs text-[#2D233D] focus:border-[#552985] focus:outline-none"
                        title="Points"
                      />
                      <span className="text-[10px] text-[#5D5E60]">pts</span>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="text-[#AE97C5] hover:text-red-500 transition"
                        title="Remove question"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {entries.length < 25 && (
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-[#EFE9F8] py-2 text-xs font-medium text-[#552985] hover:bg-[#F7F4FA] transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Question
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Upload + Grade */}
          <div className="space-y-4">
            {/* Student name */}
            <div className="rounded-xl border border-[#E3DAF0] bg-white p-4 shadow-xs">
              <label className="block text-xs font-medium text-[#5D5E60] mb-1.5">
                Student Name (optional)
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Maya Lin"
                className="w-full rounded-lg border border-[#E3DAF0] px-3 py-2 text-sm text-[#2D233D] placeholder:text-[#8E8A96] focus:border-[#552985] focus:outline-none"
              />
            </div>

            {/* Upload area */}
            <div
              className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
                files.length > 0
                  ? "border-[#7F5FA8] bg-[#F7F4FA]"
                  : "border-[#C8B9DE] bg-white hover:border-[#552985]/60 hover:bg-[#F7F4FA]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {files.length === 0 ? (
                <>
                  <Upload className="mx-auto h-10 w-10 text-[#997FBC]" />
                  <p className="mt-2 text-sm font-medium text-[#2D233D]">
                    Upload homework image
                  </p>
                  <p className="mt-1 text-xs text-[#5D5E60]">
                    Drag & drop or click — PNG, JPG, WEBP, HEIC, PDF
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7F5FA8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#633C8D] transition"
                  >
                    <Camera className="h-4 w-4" />
                    Choose File
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="relative group rounded-lg border border-[#E3DAF0] bg-white overflow-hidden shadow-xs"
                      >
                        {previews[i] ? (
                          <img
                            src={previews[i]}
                            alt={f.name}
                            className="h-24 w-24 object-cover"
                          />
                        ) : (
                          <div className="flex h-24 w-24 items-center justify-center bg-[#F7F4FA]">
                            <FileText className="h-8 w-8 text-[#7F5FA8]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 rounded-full bg-red-500 p-0.5 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="px-1 py-0.5 text-[10px] text-[#5D5E60] truncate max-w-[6rem]">
                          {f.name}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#552985] hover:text-[#633C8D] transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add More
                  </button>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Grade button */}
            <button
              type="button"
              onClick={handleGrade}
              disabled={loading || !configured}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#552985] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#633C8D] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Grading with Gemini 3.8 Flash…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Grade Homework
                </>
              )}
            </button>

            {/* Results breakdown */}
            {result && (
              <div className="space-y-3">
                {/* Transcription toggle */}
                <button
                  onClick={() => setShowTranscription(!showTranscription)}
                  className="flex w-full items-center justify-between rounded-lg border border-[#E3DAF0] bg-white px-4 py-2.5 text-left shadow-xs hover:bg-[#F7F4FA] transition"
                >
                  <span className="text-xs font-medium text-[#2D233D]">
                    📝 Transcribed Student Work
                  </span>
                  {showTranscription ? (
                    <ChevronUp className="h-4 w-4 text-[#7F5FA8]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#7F5FA8]" />
                  )}
                </button>

                {showTranscription && (
                  <div className="rounded-lg border border-[#E3DAF0] bg-white p-4">
                    <pre className="whitespace-pre-wrap text-xs text-[#2D233D] font-mono leading-relaxed">
                      {result.transcribedText}
                    </pre>
                  </div>
                )}

                {/* Per-question results */}
                <div className="rounded-xl border border-[#E3DAF0] bg-white shadow-xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#EFE9F8]">
                    <h3 className="text-sm font-semibold text-[#2D233D]">
                      Question-by-Question Results
                    </h3>
                  </div>
                  <div className="divide-y divide-[#EFE9F8]">
                    {result.results.map((r) => (
                      <div
                        key={r.questionNumber}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        {statusIcon(r.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#2D233D]">
                              Q{r.questionNumber}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                r.status === "correct"
                                  ? "bg-[#F7F4FA] text-[#552985]"
                                  : r.status === "partial"
                                    ? "bg-amber-50 text-amber-700"
                                    : r.status === "missing"
                                      ? "bg-stone-100 text-stone-500"
                                      : "bg-red-50 text-red-700"
                              }`}
                            >
                              {r.status === "correct"
                                ? "Correct"
                                : r.status === "partial"
                                  ? "Partial"
                                  : r.status === "missing"
                                    ? "Missing"
                                    : "Incorrect"}
                            </span>
                            <span className="ml-auto text-xs text-[#5D5E60]">
                              {r.pointsEarned}/{r.maxPoints} pts
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#5D5E60]">
                            Student: &ldquo;{r.studentAnswer}&rdquo;
                          </p>
                          <p className="mt-0.5 text-xs text-[#2D233D] leading-relaxed">
                            {r.explanation}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
