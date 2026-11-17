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
  onDeleteAssignment: (assignment: Assignment) => void;
  onDeleteSubmission: (id: string) => void;
  onSearchChange: (q: string) => void;
}

const STATUS_BADGE: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  ai_graded: {
    label: "AI Graded",
    className: "bg-[#FBF9FD] text-[#7F5FA8] border-[#DFD5EC]",
  },
  reviewed: {
    label: "Reviewed",
    className: "bg-[#EFE9F8] text-[#633C8D] border-[#C8B9DE]",
  },
  finalized: {
    label: "Finalized",
    className: "bg-[#552985] text-white border-[#552985]",
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
  onDeleteAssignment,
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
    <aside className="no-print flex h-full flex-col border-r border-[#E3DAF0] bg-[#F7F5FA]">
      {/* Assignments Header */}
      <div className="border-b border-[#E3DAF0] p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-[#5D5E60] uppercase">
            Assignments &amp; Rubrics
          </span>
          <button
            type="button"
            onClick={onOpenNewAssignmentModal}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#552985] transition hover:bg-[#EFE9F8]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>

        <select
          value={selectedAssignmentFilter}
          onChange={(e) => onSelectAssignmentFilter(e.target.value)}
          className="w-full rounded-lg border border-[#DFD5EC] bg-white px-2.5 py-2 text-xs font-medium text-[#2D233D] shadow-2xs outline-none focus:border-[#552985]"
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

        {selectedFilterAssignment && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-[#5D5E60]">
              {selectedFilterAssignment.gradeLevel}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEditAssignment(selectedFilterAssignment)}
                className="inline-flex items-center gap-1 rounded-md border border-[#DFD5EC] bg-white px-2 py-1 text-[11px] font-medium text-[#5D5E60] transition hover:border-[#AE97C5] hover:bg-[#EFE9F8] hover:text-[#552985]"
                title="Edit assignment, rubric, or model answer key"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteAssignment(selectedFilterAssignment)}
                className="inline-flex items-center gap-1 rounded-md border border-[#DFD5EC] bg-white px-2 py-1 text-[11px] font-medium text-[#5D5E60] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                title="Delete current assignment"
                aria-label={`Delete ${selectedFilterAssignment.title}`}
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search & New Submission */}
      <div className="border-b border-[#E3DAF0] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[#997FBC]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search student or title..."
            className="w-full rounded-lg border border-[#DFD5EC] bg-white py-1.5 pr-3 pl-8 text-xs text-[#2D233D] placeholder:text-[#8E8899] outline-none focus:border-[#552985]"
          />
        </div>
      </div>

      {/* Submission Queue List */}
      <div className="workbench-scroll flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold tracking-wider text-[#5D5E60] uppercase">
            Student Queue ({filteredSubmissions.length})
          </span>
          <button
            type="button"
            onClick={onNewSubmission}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#552985] hover:underline"
          >
            <Plus className="h-3 w-3" />
            <span>Add</span>
          </button>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#C8B9DE] bg-white/75 p-5 text-center">
            <BookOpen className="mx-auto mb-2 h-6 w-6 text-[#997FBC]" />
            <p className="text-xs font-medium text-[#2D233D]">
              {submissions.length === 0
                ? "No graded work yet"
                : "No matching submissions"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#5D5E60]">
              {submissions.length === 0
                ? "Paste a student essay or upload a photo of handwritten homework to start."
                : "Try clearing the search filter or choosing All Assignments."}
            </p>
            {submissions.length === 0 && (
              <button
                type="button"
                onClick={onNewSubmission}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#552985] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#633C8D]"
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
                      ? "border-[#552985] bg-white shadow-sm ring-1 ring-[#552985]/20"
                      : "border-[#E3DAF0] bg-white/85 hover:border-[#AE97C5] hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#2D233D]">
                        {sub.studentName}
                      </p>
                      <p className="truncate text-xs text-[#5D5E60]">
                        {sub.detectedTitle || assignment?.title || "Submission"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="font-mono-score text-sm font-bold text-[#552985]">
                        {effective.letterGrade}
                      </span>
                      <span className="font-mono-score text-[11px] text-[#5D5E60]">
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
