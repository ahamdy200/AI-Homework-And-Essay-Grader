"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Plus,
  Printer,
  Settings,
  Sparkles,
  Copy,
  Check,
  Zap,
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
    <header className="no-print sticky top-0 z-30 border-b border-[#DFD5EC] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 items-center rounded-xl border border-[#E3DAF0] bg-white px-2 py-1 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rcis-logo.png"
              alt="The Royal College International School (RCIS)"
              width={72}
              height={38}
              className="h-9 w-auto object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif-paper text-xl font-semibold tracking-tight text-[#2D233D]">
                RCIS Grading Studio
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#D7CBE8] bg-[#F7F4FA] px-2.5 py-0.5 text-[11px] font-medium text-[#552985]">
                <Sparkles className="h-3 w-3 text-[#7F5FA8]" />
                Gemini AI
              </span>
            </div>
            <p className="hidden text-xs text-[#5D5E60] sm:block">
              Mr. Ahmed Hamdy • English Homework &amp; Essay Workbench
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSubmission && (
            <>
              <button
                type="button"
                onClick={onCopyFeedback}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3DAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#2D2A32] shadow-xs transition hover:border-[#AE97C5] hover:bg-[#F7F4FA]"
                title="Copy formatted student feedback to paste into Classroom or email"
              >
                {copiedFeedback ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#552985]" />
                    <span className="font-semibold text-[#552985]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#7F5FA8]" />
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3DAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#2D2A32] shadow-xs transition hover:border-[#AE97C5] hover:bg-[#F7F4FA]"
                title="Print or Save PDF Student Feedback Sheet"
              >
                <Printer className="h-3.5 w-3.5 text-[#7F5FA8]" />
                <span className="hidden md:inline">Print / PDF</span>
              </button>
            </>
          )}

          {totalSubmissionsCount > 0 && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3DAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#2D2A32] shadow-xs transition hover:border-[#AE97C5] hover:bg-[#F7F4FA]"
              title="Export all graded submissions to CSV gradebook"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#7F5FA8]" />
              <span className="hidden lg:inline">Export CSV</span>
              <Download className="h-3 w-3 opacity-60 lg:hidden" />
            </button>
          )}

          <Link
            href="/quick-grade"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3DAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#552985] shadow-xs transition hover:border-[#AE97C5] hover:bg-[#F7F4FA]"
            title="Open Quick Grade MCQ + Essay Sheet Grader"
          >
            <Zap className="h-3.5 w-3.5 text-[#7F5FA8]" />
            <span className="hidden sm:inline">Quick Grade</span>
          </Link>

          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-xs transition ${
              configured
                ? "border-[#E3DAF0] bg-white text-[#2D2A32] hover:border-[#AE97C5] hover:bg-[#F7F4FA]"
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
              <CheckCircle2 className="h-3.5 w-3.5 text-[#552985]" />
            ) : (
              <KeyRound className="h-3.5 w-3.5 text-amber-700" />
            )}
            <span className="hidden sm:inline">
              {configured ? "API Ready" : "Set API Key"}
            </span>
            <Settings className="h-3.5 w-3.5 text-[#5D5E60] opacity-75" />
          </button>

          <button
            type="button"
            onClick={onNewSubmission}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#552985] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#633C8D]"
          >
            <Plus className="h-4 w-4" />
            <span>Grade New Work</span>
          </button>
        </div>
      </div>
      {/* Subtle 4-tone RCIS accent rule */}
      <div
        className="h-[3px] w-full"
        style={{
          background:
            "linear-gradient(90deg, #552985 0%, #633C8D 35%, #7F5FA8 60%, #997FBC 82%, #AE97C5 100%)",
        }}
      />
    </header>
  );
}
