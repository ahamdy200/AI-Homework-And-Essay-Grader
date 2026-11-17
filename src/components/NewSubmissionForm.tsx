"use client";

import React, { useRef, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  FileImage,
  FileText,
  KeyRound,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { SAMPLE_ESSAYS, type SampleStudentEssay } from "@/lib/presets";
import { countWords } from "@/lib/scoring";
import type {
  Assignment,
  GradingTone,
  RubricPreset,
  Submission,
  ThinkingLevel,
} from "@/lib/types";
import { AnswerKeyEditor } from "./AnswerKeyEditor";

interface NewSubmissionFormProps {
  assignments: Assignment[];
  presets: RubricPreset[];
  configured: boolean;
  sessionApiKey: string;
  onOpenSettings: () => void;
  onEditAssignment: (assignment: Assignment) => void;
  onDeleteAssignment: (assignment: Assignment) => void;
  onSubmissionCreated: (submission: Submission) => void;
  onCancel?: () => void;
}

export function NewSubmissionForm({
  assignments,
  presets,
  configured,
  sessionApiKey,
  onOpenSettings,
  onEditAssignment,
  onDeleteAssignment,
  onSubmissionCreated,
  onCancel,
}: NewSubmissionFormProps) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(
    assignments[0]?.id ?? "custom"
  );
  const [studentName, setStudentName] = useState("");
  const [studentIdCode, setStudentIdCode] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [modelAnswerText, setModelAnswerText] = useState("");
  const [modelAnswerFiles, setModelAnswerFiles] = useState<File[]>([]);
  const [showPerSubmissionKey, setShowPerSubmissionKey] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(
    presets[0]?.id ?? "middle-school-essay"
  );
  const [tone, setTone] = useState<GradingTone>("balanced");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("medium");
  const [inputText, setInputText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveAssignmentId =
    selectedAssignmentId === "custom" ||
    assignments.some((a) => a.id === selectedAssignmentId)
      ? selectedAssignmentId
      : (assignments[0]?.id ?? "custom");

  const selectedAssignment = assignments.find(
    (a) => a.id === effectiveAssignmentId
  );
  const selectedPreset =
    presets.find((p) => p.id === selectedPresetId) ?? presets[0];

  const handleLoadSample = (sample: SampleStudentEssay) => {
    setStudentName(sample.studentName);
    setStudentIdCode(sample.studentIdCode);
    const matchingAssign = assignments.find((a) => a.id === sample.assignmentId);
    if (matchingAssign) {
      setSelectedAssignmentId(matchingAssign.id);
      setShowPerSubmissionKey(false);
      setModelAnswerText("");
    } else {
      setSelectedAssignmentId("custom");
      if (sample.suggestedTitle) setCustomTitle(sample.suggestedTitle);
      if (sample.suggestedPrompt) setCustomPrompt(sample.suggestedPrompt);
      if (sample.suggestedPresetId) {
        setSelectedPresetId(sample.suggestedPresetId);
      }
      setModelAnswerText(sample.suggestedModelAnswer ?? "");
    }
    setInputText(sample.text);
    setFiles([]);
    setModelAnswerFiles([]);
    setError(null);
  };

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setFiles((prev) => {
      const combined = [...prev, ...list].slice(0, 6);
      return combined;
    });
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!configured) {
      setError(
        "Please configure your Gemini API key before grading. Click 'Set API Key' in the header."
      );
      onOpenSettings();
      return;
    }

    if (!studentName.trim()) {
      setError("Please enter the student's name.");
      return;
    }

    if (!inputText.trim() && files.length === 0) {
      setError(
        "Paste the student's writing or upload at least one photo or PDF of their homework."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("studentName", studentName.trim());
      formData.append("studentIdCode", studentIdCode.trim());
      formData.append("assignmentId", effectiveAssignmentId);
      formData.append("tone", tone);
      formData.append("thinkingLevel", thinkingLevel);
      formData.append("inputText", inputText);

      if (selectedAssignment) {
        formData.append("assignmentTitle", selectedAssignment.title);
        formData.append("assignmentPrompt", selectedAssignment.prompt);
        formData.append("gradeLevel", selectedAssignment.gradeLevel);
        formData.append("rubricName", selectedAssignment.rubricName);
        formData.append(
          "criteria",
          JSON.stringify(selectedAssignment.criteria)
        );
      } else {
        formData.append(
          "assignmentTitle",
          customTitle.trim() || "English Writing Assignment"
        );
        formData.append("assignmentPrompt", customPrompt.trim());
        formData.append("gradeLevel", selectedPreset.gradeLevel);
        formData.append("rubricName", selectedPreset.name);
        formData.append("criteria", JSON.stringify(selectedPreset.criteria));
      }

      for (const file of files) {
        formData.append("files", file);
      }

      if (!selectedAssignment || showPerSubmissionKey) {
        formData.append("modelAnswerText", modelAnswerText);
        if (selectedAssignment && showPerSubmissionKey) {
          formData.append("overrideModelAnswer", "true");
        }
        for (const keyFile of modelAnswerFiles) {
          formData.append("modelAnswerFiles", keyFile);
        }
      }

      const headers: Record<string, string> = {};
      if (sessionApiKey.trim()) {
        headers["x-gemini-api-key"] = sessionApiKey.trim();
      }

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers,
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Grading failed.");
      }

      onSubmissionCreated(json.submission);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to grade submission."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const wordCount = countWords(inputText);

  return (
    <div className="workbench-scroll h-full overflow-y-auto bg-[#F7F5FA]/70 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DFD5EC] bg-[#F7F4FA] px-2.5 py-1 text-xs font-medium text-[#552985]">
              <Sparkles className="h-3.5 w-3.5 text-[#7F5FA8]" />
              Powered by Gemini 3.8 Flash (Multimodal Vision + Rubric Engine)
            </span>
            <h2 className="font-serif-paper mt-2 text-2xl font-semibold text-[#2D233D]">
              Grade Student Homework or Essay
            </h2>
            <p className="mt-1 text-sm text-[#5D5E60]">
              Paste typed writing or upload photos and PDFs of handwritten student
              work. You can review and adjust every annotation and score afterward.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[#E3DAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#2D233D] hover:bg-[#F7F4FA]"
            >
              Back to Paper
            </button>
          )}
        </div>

        {/* Sample Essay Quick Loaders */}
        <div className="mb-6 rounded-2xl border border-[#E3DAF0] bg-white p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2D233D]">
              <BookOpenCheck className="h-4 w-4 text-[#552985]" />
              <span>Try a Sample Student Submission:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_ESSAYS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  className="rounded-lg border border-[#E3DAF0] bg-[#F7F5FA] px-2.5 py-1 text-xs font-medium text-[#2D233D] transition hover:border-[#552985] hover:bg-[#EFE9F8] hover:text-[#552985]"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-[#E3DAF0] bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Student Info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                Student Name *
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g., Maya Lin"
                required
                className="w-full rounded-xl border border-[#E3DAF0] bg-[#F7F5FA]/60 px-3.5 py-2.5 text-sm text-[#2D233D] outline-none focus:border-[#552985] focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                Class / Student ID (Optional)
              </label>
              <input
                type="text"
                value={studentIdCode}
                onChange={(e) => setStudentIdCode(e.target.value)}
                placeholder="e.g., Per. 3 • #14"
                className="w-full rounded-xl border border-[#E3DAF0] bg-[#F7F5FA]/60 px-3.5 py-2.5 text-sm text-[#2D233D] outline-none focus:border-[#552985] focus:bg-white"
              />
            </div>
          </div>

          {/* Assignment & Rubric Selection */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                Assignment / Prompt
              </label>
              <select
                value={effectiveAssignmentId}
                onChange={(e) => {
                  setSelectedAssignmentId(e.target.value);
                  setShowPerSubmissionKey(false);
                }}
                className="w-full rounded-xl border border-[#E3DAF0] bg-[#F7F5FA]/60 px-3.5 py-2.5 text-sm text-[#2D233D] outline-none focus:border-[#552985] focus:bg-white"
              >
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.gradeLevel})
                  </option>
                ))}
                <option value="custom">Custom / One-off Assignment</option>
              </select>
            </div>

            {selectedAssignment ? (
              <div className="rounded-xl border border-[#E3DAF0] bg-[#F7F4FA] px-3.5 py-2.5">
                <div className="text-[11px] font-semibold tracking-wider text-[#7F5FA8] uppercase">
                  Active Rubric ({selectedAssignment.criteria.length} criteria)
                </div>
                <div className="mt-0.5 text-xs font-medium text-[#2D233D]">
                  {selectedAssignment.rubricName}
                </div>
                {selectedAssignment.prompt && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-[#5D5E60]">
                    {selectedAssignment.prompt}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                  Rubric Preset
                </label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="w-full rounded-xl border border-[#E3DAF0] bg-[#F7F5FA]/60 px-3.5 py-2.5 text-sm text-[#2D233D] outline-none focus:border-[#552985] focus:bg-white"
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.gradeLevel})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedAssignment && (
            <div className="space-y-3 rounded-xl border border-[#DFD5EC] bg-[#F7F4FA] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <KeyRound className="h-3.5 w-3.5 text-[#552985]" />
                  {selectedAssignment.modelAnswerText ||
                  selectedAssignment.modelAnswerAttachments.length > 0 ? (
                    <span className="font-semibold text-[#552985]">
                      Answer Key Attached
                      {selectedAssignment.modelAnswerAttachments.length > 0
                        ? ` (${selectedAssignment.modelAnswerAttachments.length} file${selectedAssignment.modelAnswerAttachments.length > 1 ? "s" : ""})`
                        : ""}
                    </span>
                  ) : (
                    <span className="font-medium text-[#2D233D]">
                      No saved Model Answer / Answer Key for this assignment yet
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditAssignment(selectedAssignment)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E3DAF0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2D233D] hover:bg-[#EFE9F8]"
                  >
                    <Pencil className="h-3 w-3 text-[#7F5FA8]" />
                    <span>
                      {selectedAssignment.modelAnswerText ||
                      selectedAssignment.modelAnswerAttachments.length > 0
                        ? "Edit Assignment Key"
                        : "Save Key to Assignment"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAssignment(selectedAssignment)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E3DAF0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#5D5E60] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    title="Delete current assignment"
                    aria-label={`Delete ${selectedAssignment.title}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete Assignment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPerSubmissionKey((v) => !v)}
                    className="rounded-lg border border-[#AE97C5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#552985] hover:bg-[#EFE9F8]"
                  >
                    {showPerSubmissionKey
                      ? "Use Assignment Key"
                      : "Attach / Override for This Paper"}
                  </button>
                </div>
              </div>

              {selectedAssignment.modelAnswerText && !showPerSubmissionKey && (
                <p className="line-clamp-2 rounded-lg border border-[#E3DAF0] bg-white px-3 py-2 text-[11px] text-[#5D5E60] whitespace-pre-wrap">
                  {selectedAssignment.modelAnswerText}
                </p>
              )}

              {showPerSubmissionKey && (
                <AnswerKeyEditor
                  compact
                  modelAnswerText={modelAnswerText}
                  onChangeText={setModelAnswerText}
                  newFiles={modelAnswerFiles}
                  onChangeNewFiles={setModelAnswerFiles}
                />
              )}
            </div>
          )}

          {!selectedAssignment && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E3DAF0] bg-[#F7F4FA] p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#2D233D]">
                  Custom Assignment Title
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g., To Kill a Mockingbird Chapter 9 Response"
                  className="w-full rounded-lg border border-[#E3DAF0] bg-white px-3 py-2 text-sm text-[#2D233D] outline-none focus:border-[#552985]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#2D233D]">
                  Homework Prompt / Grading Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Describe what the student was asked to write or answer..."
                  className="w-full rounded-lg border border-[#E3DAF0] bg-white px-3 py-2 text-sm text-[#2D233D] outline-none focus:border-[#552985]"
                />
              </div>

              <AnswerKeyEditor
                compact
                modelAnswerText={modelAnswerText}
                onChangeText={setModelAnswerText}
                newFiles={modelAnswerFiles}
                onChangeNewFiles={setModelAnswerFiles}
              />
            </div>
          )}

          {/* Tone & Reasoning Depth */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                Feedback Tone &amp; Strictness
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#E3DAF0] bg-[#F7F5FA] p-1">
                {(
                  [
                    { id: "encouraging", label: "Encouraging" },
                    { id: "balanced", label: "Balanced" },
                    { id: "strict", label: "Strict" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTone(item.id)}
                    className={`rounded-lg py-1.5 text-xs font-medium transition ${
                      tone === item.id
                        ? "bg-[#552985] text-white shadow-xs"
                        : "text-[#5D5E60] hover:text-[#2D233D]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
                Gemini 3.8 Flash Reasoning Depth
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#E3DAF0] bg-[#F7F5FA] p-1">
                {(
                  [
                    { id: "low", label: "Quick (Low)" },
                    { id: "medium", label: "Standard" },
                    { id: "high", label: "Deep (High)" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setThinkingLevel(item.id)}
                    className={`rounded-lg py-1.5 text-xs font-medium transition ${
                      thinkingLevel === item.id
                        ? "bg-[#552985] text-white shadow-xs"
                        : "text-[#5D5E60] hover:text-[#2D233D]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student Text Input */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#2D233D]">
                Student Essay or Homework Text
              </label>
              <span className="font-mono-score text-xs text-[#5D5E60]">
                {wordCount} words
              </span>
            </div>
            <textarea
              rows={10}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste the student's essay or homework response here — or leave blank if uploading handwritten photos or PDFs below..."
              className="font-serif-paper w-full rounded-xl border border-[#E3DAF0] bg-[#F7F5FA]/50 p-4 text-[15px] leading-relaxed text-[#2D233D] placeholder:font-sans placeholder:text-sm placeholder:text-[#8E8A96] outline-none focus:border-[#552985] focus:bg-white"
            />
          </div>

          {/* Multimodal Photo & PDF Uploader */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#2D233D]">
              Handwritten Photos or PDF Uploads (Optional — up to 6 files)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  addFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${
                isDragging
                  ? "border-[#552985] bg-[#EFE9F8]/80"
                  : "border-[#C8B9DE] bg-[#F7F4FA]/70 hover:border-[#7F5FA8] hover:bg-[#EFE9F8]/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf,.txt,.md"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />
              <Upload className="mx-auto mb-2 h-6 w-6 text-[#7F5FA8]" />
              <p className="text-xs font-medium text-[#2D233D]">
                Drop handwritten essay photos, scanned PDFs, or .txt files here —
                or click to browse
              </p>
              <p className="mt-1 text-[11px] text-[#5D5E60]">
                Supports PNG, JPG, WEBP, HEIC, PDF (high-resolution vision OCR), and TXT
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-[#E3DAF0] bg-[#F7F4FA] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {file.type === "application/pdf" ? (
                        <FileText className="h-4 w-4 shrink-0 text-[#552985]" />
                      ) : (
                        <FileImage className="h-4 w-4 shrink-0 text-[#7F5FA8]" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[#2D233D]">
                          {file.name}
                        </p>
                        <p className="text-[10px] text-[#5D5E60]">
                          {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="rounded p-1 text-[#5D5E60] hover:bg-[#E3DAF0] hover:text-[#2D233D]"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between border-t border-[#E3DAF0] pt-4">
            <p className="text-xs text-[#5D5E60]">
              AI suggestions are completely editable before you export or print.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#552985] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#633C8D] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Grading with Gemini 3.8 Flash...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Check &amp; Grade Work</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
