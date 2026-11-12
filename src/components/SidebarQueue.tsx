"use client";

import React from "react";
import {
  BookOpen,
  FileImage,
  FileText,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { getEffectiveSubmissionGrade } from "@/lib/scoring";
import type { Assignment, Submission, SubmissionStatus } from "@/lib/types";

interface SidebarQueueProps {
  assignments: Assignment[];
  submissions: Submission[];
  selectedAssignmentFilter: string;
  selectedSubmissionId: string | null;
  searchQuery: string;
  onSelectAssignmentFilter: (id: string) => void;
  onSelectSubmission: (id: string) => void;
  onNewSubmission: () => void;
  onOpenNewAssignmentModal: () => void;
  onEditAssignment: (assignment: Assignment) => void;
  onDeleteSubmission: (id: string) => void;
  onSearchChange: (q: string) => void;
}

const STATUS_BADGE: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  ai_graded: {
    label: "AI Graded",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  reviewed: {
    label: "Reviewed",
    className: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  finalized: {
    label: "Finalized",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

export function SidebarQueue({
  assignments,
  submissions,
  selectedAssignmentFilter,
  selectedSubmissionId,
  searchQuery,
  onSelectAssignmentFilter,
  onSelectSubmission,
  onNewSubmission,
  onOpenNewAssignmentModal,
  onEditAssignment,
  onDeleteSubmission,
  onSearchChange,
}: SidebarQueueProps) {
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
  const selectedFilterAssignment =
    selectedAssignmentFilter !== "all"
      ? assignmentMap.get(selectedAssignmentFilter)
      : undefined;

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesAssignment =
      selectedAssignmentFilter === "all" ||
      sub.assignmentId === selectedAssignmentFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      sub.studentName.toLowerCase().includes(q) ||
      sub.detectedTitle.toLowerCase().includes(q) ||
      sub.studentIdCode.toLowerCase().includes(q);
    return matchesAssignment && matchesQuery;
  });

  return (
    <aside className="no-print flex h-full flex-col border-r border-[#E6DFD2] bg-[#FAF8F4]">
      {/* Assignments Header */}
      <div className="border-b border-[#E6DFD2] p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
            Assignments &amp; Rubrics
          </span>
          <div className="flex items-center gap-1">
            {selectedFilterAssignment && (
              <button
                type="button"
                onClick={() => onEditAssignment(selectedFilterAssignment)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-200/70 hover:text-stone-900"
                title="Edit assignment, rubric, or model answer key"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNewAssignmentModal}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1F5E4B] transition hover:bg-emerald-50"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>
        </div>

        <select
          value={selectedAssignmentFilter}
          onChange={(e) => onSelectAssignmentFilter(e.target.value)}
          className="w-full rounded-lg border border-[#E6DFD2] bg-white px-2.5 py-2 text-xs font-medium text-stone-800 shadow-2xs outline-none focus:border-[#1F5E4B]"
          aria-label="Filter submissions by assignment"
        >
          <option value="all">All Assignments ({submissions.length})</option>
          {assignments.map((a) => {
            const count = submissions.filter((s) => s.assignmentId === a.id).length;
            return (
              <option key={a.id} value={a.id}>
                {a.title} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* Search & New Submission */}
      <div className="border-b border-[#E6DFD2] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search student or title..."
            className="w-full rounded-lg border border-[#E6DFD2] bg-white py-1.5 pr-3 pl-8 text-xs text-stone-800 placeholder:text-stone-400 outline-none focus:border-[#1F5E4B]"
          />
        </div>
      </div>

      {/* Submission Queue List */}
      <div className="workbench-scroll flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
            Student Queue ({filteredSubmissions.length})
          </span>
          <button
            type="button"
            onClick={onNewSubmission}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[#1F5E4B] hover:underline"
          >
            <Plus className="h-3 w-3" />
            <span>Add</span>
          </button>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white/60 p-5 text-center">
            <BookOpen className="mx-auto mb-2 h-6 w-6 text-stone-400" />
            <p className="text-xs font-medium text-stone-700">
              {submissions.length === 0
                ? "No graded work yet"
                : "No matching submissions"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
              {submissions.length === 0
                ? "Paste a student essay or upload a photo of handwritten homework to start."
                : "Try clearing the search filter or choosing All Assignments."}
            </p>
            {submissions.length === 0 && (
              <button
                type="button"
                onClick={onNewSubmission}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#1F5E4B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#174839]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Grade First Paper</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSubmissions.map((sub) => {
              const effective = getEffectiveSubmissionGrade(sub);
              const badge = STATUS_BADGE[sub.status];
              const isSelected = sub.id === selectedSubmissionId;
              const assignment = assignmentMap.get(sub.assignmentId);

              return (
                <div
                  key={sub.id}
                  onClick={() => onSelectSubmission(sub.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSubmission(sub.id);
                    }
                  }}
                  className={`group relative cursor-pointer rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-[#1F5E4B] bg-white shadow-sm ring-1 ring-[#1F5E4B]/20"
                      : "border-[#E6DFD2] bg-white/80 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {sub.studentName}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {sub.detectedTitle || assignment?.title || "Submission"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="font-mono-score text-sm font-bold text-stone-900">
                        {effective.letterGrade}
                      </span>
                      <span className="font-mono-score text-[11px] text-stone-500">
                        {effective.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {sub.attachments.length > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-500">
                          <FileImage className="h-3 w-3" />
                          <span>{sub.attachments.length}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-500">
                          <FileText className="h-3 w-3" />
                          <span>{sub.wordCount}w</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSubmission(sub.id);
                      }}
                      className="rounded p-1 text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      title="Delete submission"
                      aria-label={`Delete ${sub.studentName}'s submission`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
