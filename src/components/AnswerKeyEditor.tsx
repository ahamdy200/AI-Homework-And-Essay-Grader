"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileImage,
  FileText,
  KeyRound,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { parseAnswerKeyText } from "@/lib/mcq";
import type { UploadedAttachment } from "@/lib/types";

interface AnswerKeyEditorProps {
  modelAnswerText: string;
  onChangeText: (value: string) => void;
  newFiles: File[];
  onChangeNewFiles: React.Dispatch<React.SetStateAction<File[]>>;
  existingAttachments?: UploadedAttachment[];
  removedAttachmentIds?: string[];
  onToggleRemoveExisting?: (attachmentId: string) => void;
  compact?: boolean;
}

export function AnswerKeyEditor({
  modelAnswerText,
  onChangeText,
  newFiles,
  onChangeNewFiles,
  existingAttachments = [],
  removedAttachmentIds = [],
  onToggleRemoveExisting,
  compact = false,
}: AnswerKeyEditorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    onChangeNewFiles((prev) => [...prev, ...list].slice(0, 6));
  };

  const removeNewFile = (index: number) => {
    onChangeNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removedSet = new Set(removedAttachmentIds);
  const parsedKey = useMemo(
    () => parseAnswerKeyText(modelAnswerText),
    [modelAnswerText]
  );

  const MIXED_EXAMPLE =
    "1. c\n2. B\n3. D\n4. A\n5. Essay: Explain the theme of honesty and support your answer with one specific detail from the story.";

  return (
    <div className="rounded-xl border border-[#D7CBE8] bg-[#F7F4FA]/75 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#552985]">
            <KeyRound className="h-3.5 w-3.5 text-[#7F5FA8]" />
            <span>Model Answer / Answer Key (MCQs &amp; Essays)</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#5D5E60]">
            Paste mixed MCQ keys (e.g.{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-[#552985]">
              1.c 2.B and 3. D
            </code>
            ) plus open/essay guidelines (e.g.{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-[#552985]">
              5. Essay: ...
            </code>
            ) or upload a key image/PDF.
          </p>
        </div>
        {!modelAnswerText.trim() && (
          <button
            type="button"
            onClick={() => onChangeText(MIXED_EXAMPLE)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#D7CBE8] bg-white px-2 py-1 text-[10px] font-medium text-[#552985] transition hover:bg-[#EFE9F8]"
          >
            <Sparkles className="h-3 w-3 text-[#7F5FA8]" />
            Insert MCQ + Essay Example
          </button>
        )}
      </div>

      <textarea
        rows={compact ? 3 : 4}
        value={modelAnswerText}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={
          "Example (mixed quiz + essay):\n1. c 2. B and 3. D\n5. Essay: Explain the main character's decision using one example from the passage."
        }
        className="w-full rounded-xl border border-[#DFD5EC] bg-white p-3 text-xs leading-relaxed text-[#2D2A32] placeholder:text-[#8E8899] outline-none focus:border-[#552985]"
      />

      {(parsedKey.mcqKeys.length > 0 || parsedKey.openQuestions.length > 0) && (
        <div className="mt-2 rounded-lg border border-[#DFD5EC] bg-white px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#552985]">
            <CheckCircle2 className="h-3 w-3 text-[#7F5FA8]" />
            <span>
              Auto-Detected Key ({parsedKey.mcqKeys.length} MCQ
              {parsedKey.mcqKeys.length === 1 ? "" : "s"}
              {parsedKey.openQuestions.length > 0
                ? `, ${parsedKey.openQuestions.length} Open/Essay`
                : ""}
              )
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parsedKey.mcqKeys.map((k) => (
              <span
                key={`mcq-${k.questionNumber}`}
                className="inline-flex items-center gap-1 rounded-md border border-[#D7CBE8] bg-[#F7F4FA] px-2 py-0.5 text-[11px] font-semibold text-[#552985]"
              >
                <span className="text-[#7F5FA8]">Q{k.questionNumber}:</span>
                <span className="font-mono">{k.expectedAnswer}</span>
                {k.maxPoints !== 1 && (
                  <span className="text-[10px] font-normal text-[#7F5FA8]">
                    ({k.maxPoints}pt)
                  </span>
                )}
              </span>
            ))}
            {parsedKey.openQuestions.map((q) => (
              <span
                key={`open-${q.questionNumber}`}
                title={q.label}
                className="inline-flex items-center gap-1 rounded-md border border-[#C8B9DE] bg-[#FBF9FD] px-2 py-0.5 text-[11px] font-medium text-[#633C8D]"
              >
                <span className="font-semibold">Q{q.questionNumber}:</span>
                <span className="max-w-[220px] truncate">{q.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Saved Attachments when editing an existing assignment */}
      {existingAttachments.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <div className="text-[11px] font-semibold text-stone-600">
            Saved Answer Key Files:
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {existingAttachments.map((att) => {
              const isRemoved = removedSet.has(att.id);
              return (
                <div
                  key={att.id}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
                    isRemoved
                      ? "border-red-200 bg-red-50/70 text-stone-400 line-through"
                      : "border-[#E3DAF0] bg-white text-[#2D233D]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {att.mimeType === "application/pdf" ? (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-red-700" />
                    ) : (
                      <FileImage className="h-3.5 w-3.5 shrink-0 text-[#552985]" />
                    )}
                    <a
                      href={att.urlPath}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium hover:underline"
                    >
                      {att.originalName}
                    </a>
                  </div>
                  {onToggleRemoveExisting && (
                    <button
                      type="button"
                      onClick={() => onToggleRemoveExisting(att.id)}
                      className="rounded p-1 text-[#5D5E60] hover:bg-[#F7F4FA] hover:text-[#2D233D]"
                      title={isRemoved ? "Keep file" : "Remove file"}
                    >
                      {isRemoved ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload dropzone for Answer Key Photos / PDFs */}
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
        className={`mt-2.5 cursor-pointer rounded-xl border border-dashed px-3 py-3 text-center transition ${
          isDragging
            ? "border-[#552985] bg-[#EFE9F8]"
            : "border-[#AE97C5] bg-white hover:border-[#552985]"
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
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#2D2A32]">
          <Upload className="h-3.5 w-3.5 text-[#552985]" />
          <span className="font-medium">
            Upload Answer Key Photo or PDF (optional)
          </span>
          <span className="text-[11px] text-[#5D5E60]">
            PNG, JPG, WEBP, HEIC, PDF, TXT
          </span>
        </div>
      </div>

      {newFiles.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {newFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between rounded-lg border border-[#E3DAF0] bg-white px-2.5 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                {file.type === "application/pdf" ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#633C8D]" />
                ) : (
                  <FileImage className="h-3.5 w-3.5 shrink-0 text-[#552985]" />
                )}
                <span className="truncate font-medium text-stone-800">
                  {file.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeNewFile(idx)}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
