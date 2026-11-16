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
  if (pct >= 90) return "text-emerald-700";
  if (pct >= 80) return "text-blue-700";
  if (pct >= 70) return "text-amber-700";
  if (pct >= 60) return "text-orange-700";
  return "text-red-700";
}

function gradeBg(pct: number): string {
  if (pct >= 90) return "bg-emerald-50 border-emerald-200";
  if (pct >= 80) return "bg-blue-50 border-blue-200";
  if (pct >= 70) return "bg-amber-50 border-amber-200";
  if (pct >= 60) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function statusIcon(status: string) {
  switch (status) {
    case "correct":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
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
    <div className="min-h-screen bg-[#FAF8F4]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E6DFD2] bg-[#FAF8F4]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-stone-500 transition hover:text-stone-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-medium hidden sm:inline">
                Back to Workbench
              </span>
            </Link>
            <div className="h-5 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#991B1B] text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <h1 className="font-serif text-lg font-semibold tracking-tight text-stone-900">
                Quick Grade
              </h1>
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
                  className="w-48 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-stone-800 placeholder:text-amber-600/60 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                configured
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              {configured ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <KeyRound className="h-3 w-3" />
              )}
              {configured ? "API Ready" : "Need Key"}
            </span>
          </div>
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
                <p className="mt-1 text-sm text-stone-600">
                  {result.totalScore} / {result.maxScore} points
                  {studentName.trim() ? ` — ${studentName.trim()}` : ""}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-white transition"
              >
                <Camera className="h-3.5 w-3.5" />
                Grade Another
              </button>
            </div>
            <p className="mt-3 text-sm text-stone-700 leading-relaxed">
              {result.summaryFeedback}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Answer Key */}
          <div className="space-y-4">
            <button
              onClick={() => setShowKeyEditor(!showKeyEditor)}
              className="flex w-full items-center justify-between rounded-lg bg-white border border-[#E6DFD2] px-4 py-3 text-left shadow-xs"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#991B1B]" />
                <span className="text-sm font-semibold text-stone-800">
                  Answer Key
                </span>
                <span className="text-xs text-stone-500">
                  ({entries.filter((e) => e.correctAnswer.trim()).length} of{" "}
                  {entries.length} filled)
                </span>
              </div>
              {showKeyEditor ? (
                <ChevronUp className="h-4 w-4 text-stone-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-stone-400" />
              )}
            </button>

            {showKeyEditor && (
              <div className="rounded-xl border border-[#E6DFD2] bg-white shadow-xs overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-stone-100">
                  {entries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50/50"
                    >
                      {/* Number */}
                      <span className="w-7 text-center text-xs font-bold text-stone-400">
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
                        className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700 focus:border-[#991B1B] focus:outline-none"
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
                                  ? "bg-[#1F5E4B] text-white shadow-sm"
                                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
                          className="flex-1 min-w-0 rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-800 placeholder:text-stone-400 focus:border-[#991B1B] focus:outline-none"
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
                        className="w-12 rounded border border-stone-200 bg-stone-50 px-1.5 py-1 text-center text-xs text-stone-700 focus:border-[#991B1B] focus:outline-none"
                        title="Points"
                      />
                      <span className="text-[10px] text-stone-400">pts</span>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="text-stone-300 hover:text-red-500 transition"
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
                    className="flex w-full items-center justify-center gap-1.5 border-t border-stone-100 py-2 text-xs font-medium text-[#1F5E4B] hover:bg-emerald-50/50 transition"
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
            <div className="rounded-xl border border-[#E6DFD2] bg-white p-4 shadow-xs">
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Student Name (optional)
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Maya Lin"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#991B1B] focus:outline-none"
              />
            </div>

            {/* Upload area */}
            <div
              className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
                files.length > 0
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-stone-300 bg-white hover:border-[#991B1B]/40 hover:bg-red-50/20"
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
                  <Upload className="mx-auto h-10 w-10 text-stone-300" />
                  <p className="mt-2 text-sm font-medium text-stone-600">
                    Upload homework image
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Drag & drop or click — PNG, JPG, WEBP, HEIC, PDF
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#991B1B] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#7F1D1D] transition"
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
                        className="relative group rounded-lg border border-stone-200 bg-white overflow-hidden shadow-xs"
                      >
                        {previews[i] ? (
                          <img
                            src={previews[i]}
                            alt={f.name}
                            className="h-24 w-24 object-cover"
                          />
                        ) : (
                          <div className="flex h-24 w-24 items-center justify-center bg-stone-100">
                            <FileText className="h-8 w-8 text-stone-400" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 rounded-full bg-red-500 p-0.5 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="px-1 py-0.5 text-[10px] text-stone-500 truncate max-w-[6rem]">
                          {f.name}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#991B1B] hover:text-[#7F1D1D] transition"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1F5E4B] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174839] disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="flex w-full items-center justify-between rounded-lg border border-[#E6DFD2] bg-white px-4 py-2.5 text-left shadow-xs hover:bg-stone-50 transition"
                >
                  <span className="text-xs font-medium text-stone-700">
                    📝 Transcribed Student Work
                  </span>
                  {showTranscription ? (
                    <ChevronUp className="h-4 w-4 text-stone-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-stone-400" />
                  )}
                </button>

                {showTranscription && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                    <pre className="whitespace-pre-wrap text-xs text-stone-700 font-mono leading-relaxed">
                      {result.transcribedText}
                    </pre>
                  </div>
                )}

                {/* Per-question results */}
                <div className="rounded-xl border border-[#E6DFD2] bg-white shadow-xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <h3 className="text-sm font-semibold text-stone-800">
                      Question-by-Question Results
                    </h3>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {result.results.map((r) => (
                      <div
                        key={r.questionNumber}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        {statusIcon(r.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-700">
                              Q{r.questionNumber}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                r.status === "correct"
                                  ? "bg-emerald-50 text-emerald-700"
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
                            <span className="ml-auto text-xs text-stone-500">
                              {r.pointsEarned}/{r.maxPoints} pts
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-stone-500">
                            Student: &ldquo;{r.studentAnswer}&rdquo;
                          </p>
                          <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">
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
