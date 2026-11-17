"use client";

import React from "react";
import {
  CheckCircle2,
  Download,
  Feather,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Plus,
  Printer,
  Settings,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import type { Submission } from "@/lib/types";

interface HeaderBarProps {
  configured: boolean;
  envConfigured: boolean;
  activeSubmission: Submission | null;
  totalSubmissionsCount: number;
  copiedFeedback: boolean;
  onNewSubmission: () => void;
  onOpenSettings: () => void;
  onCopyFeedback: () => void;
  onPreviewReport: () => void;
  onPrintReport: () => void;
  onExportCsv: () => void;
}

export function HeaderBar({
  configured,
  envConfigured,
  activeSubmission,
  totalSubmissionsCount,
  copiedFeedback,
  onNewSubmission,
  onOpenSettings,
  onCopyFeedback,
  onPreviewReport,
  onPrintReport,
  onExportCsv,
}: HeaderBarProps) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#E6DFD2] bg-[#FAF8F4]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#991B1B] text-white shadow-sm">
            <Feather className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif-paper text-xl font-semibold tracking-tight text-stone-900">
                RedPen Studio
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                <Sparkles className="h-3 w-3" />
                Gemini 3.8 Flash
              </span>
            </div>
            <p className="hidden text-xs text-stone-500 sm:block">
              English Homework &amp; Essay Grading Workbench
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSubmission && (
            <>
              <button
                type="button"
                onClick={onCopyFeedback}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6DFD2] bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-xs transition hover:border-stone-300 hover:bg-stone-50"
                title="Copy formatted student feedback to paste into Classroom or email"
              >
                {copiedFeedback ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                    <span className="text-emerald-800">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Copy Feedback</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onPreviewReport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7CBE8] bg-[#F7F4FA] px-3 py-1.5 text-xs font-semibold text-[#552985] shadow-xs transition hover:border-[#AE97C5] hover:bg-[#EFE9F8]"
                title="Preview RCIS Student Report on screen"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden md:inline">View Report</span>
              </button>

              <button
                type="button"
                onClick={onPrintReport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6DFD2] bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-xs transition hover:border-stone-300 hover:bg-stone-50"
                title="Print or Save PDF Student Feedback Sheet"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Print / PDF</span>
              </button>
            </>
          )}

          {totalSubmissionsCount > 0 && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6DFD2] bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-xs transition hover:border-stone-300 hover:bg-stone-50"
              title="Export all graded submissions to CSV gradebook"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Export CSV</span>
              <Download className="h-3 w-3 opacity-60 lg:hidden" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-xs transition ${
              configured
                ? "border-[#E6DFD2] bg-white text-stone-700 hover:bg-stone-50"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
            title={
              envConfigured
                ? "Gemini API key configured via .env.local"
                : configured
                  ? "Gemini API key active in browser session"
                  : "Configure Gemini API key"
            }
          >
            {configured ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <KeyRound className="h-3.5 w-3.5 text-amber-700" />
            )}
            <span className="hidden sm:inline">
              {configured ? "API Ready" : "Set API Key"}
            </span>
            <Settings className="h-3.5 w-3.5 opacity-60" />
          </button>

          <button
            type="button"
            onClick={onNewSubmission}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F5E4B] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#174839]"
          >
            <Plus className="h-4 w-4" />
            <span>Grade New Work</span>
          </button>
        </div>
      </div>
    </header>
  );
}
