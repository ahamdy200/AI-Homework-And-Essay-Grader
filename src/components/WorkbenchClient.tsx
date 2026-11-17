"use client";

import React, { useEffect, useMemo, useState } from "react";
import { exportSubmissionsToCsv, formatStudentFeedbackMarkdown } from "@/lib/export";
import { applyMcqResultsToCriteria } from "@/lib/mcq";
import type {
  AnnotationItem,
  Assignment,
  QuestionResult,
  RubricPreset,
  Submission,
} from "@/lib/types";
import { AnnotatedPaper } from "./AnnotatedPaper";
import { AssignmentModal } from "./AssignmentModal";
import { GradingSidebar } from "./GradingSidebar";
import { HeaderBar } from "./HeaderBar";
import { NewSubmissionForm } from "./NewSubmissionForm";
import { PrintReport } from "./PrintReport";
import { SettingsModal } from "./SettingsModal";
import { SidebarQueue } from "./SidebarQueue";

const SESSION_KEY_STORAGE = "redpen_session_gemini_key";

interface WorkbenchClientProps {
  initialAssignments: Assignment[];
  initialSubmissions: Submission[];
  presets: RubricPreset[];
  initialEnvConfigured: boolean;
}

export function WorkbenchClient({
  initialAssignments,
  initialSubmissions,
  presets,
  initialEnvConfigured,
}: WorkbenchClientProps) {
  const [assignments, setAssignments] =
    useState<Assignment[]>(initialAssignments);
  const [submissions, setSubmissions] =
    useState<Submission[]>(initialSubmissions);
  const [selectedAssignmentFilter, setSelectedAssignmentFilter] =
    useState<string>("all");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(initialSubmissions[0]?.id ?? null);
  const [isComposingNew, setIsComposingNew] = useState<boolean>(
    initialSubmissions.length === 0
  );
  const [searchQuery, setSearchQuery] = useState("");

  const [envConfigured, setEnvConfigured] = useState(initialEnvConfigured);
  const [sessionApiKey, setSessionApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<Assignment | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY_STORAGE);
      if (saved) setSessionApiKey(saved);
    } catch {
      // Ignore sessionStorage restrictions
    }
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health", {
          headers: sessionApiKey
            ? { "x-gemini-api-key": sessionApiKey }
            : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setEnvConfigured(Boolean(data.envConfigured));
        }
      } catch {
        // Ignore transient health check error
      }
    };
    checkHealth();
  }, [sessionApiKey]);

  const configured = envConfigured || Boolean(sessionApiKey.trim());

  const activeSubmission = useMemo(
    () => submissions.find((s) => s.id === selectedSubmissionId) ?? null,
    [submissions, selectedSubmissionId]
  );

  const activeAssignment = useMemo(() => {
    if (!activeSubmission) return undefined;
    return assignments.find((a) => a.id === activeSubmission.assignmentId);
  }, [assignments, activeSubmission]);

  const handleSaveSessionKey = (key: string) => {
    setSessionApiKey(key);
    try {
      if (key) {
        window.sessionStorage.setItem(SESSION_KEY_STORAGE, key);
      } else {
        window.sessionStorage.removeItem(SESSION_KEY_STORAGE);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  };

  const handleSubmissionCreated = (created: Submission) => {
    setSubmissions((prev) => [created, ...prev]);
    setSelectedSubmissionId(created.id);
    setIsComposingNew(false);
  };

  const handlePatchSubmission = async (patch: Partial<Submission>) => {
    if (!activeSubmission) return;
    const targetId = activeSubmission.id;

    // Optimistically update local state
    setSubmissions((prev) =>
      prev.map((s) => (s.id === targetId ? { ...s, ...patch } : s))
    );

    const res = await fetch(`/api/submissions/${targetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.submission) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === targetId ? json.submission : s))
        );
      }
    }
  };

  const handleUpdateAnnotations = (annotations: AnnotationItem[]) => {
    void handlePatchSubmission({
      annotations,
      status:
        activeSubmission?.status === "ai_graded"
          ? "reviewed"
          : activeSubmission?.status,
    });
  };

  const handleUpdateQuestionResults = (questionResults: QuestionResult[]) => {
    if (!activeSubmission) return;
    const syncedCriteria = applyMcqResultsToCriteria(
      activeSubmission.criterionScores,
      questionResults,
      "teacher"
    );
    void handlePatchSubmission({
      questionResults,
      criterionScores: syncedCriteria,
      status:
        activeSubmission.status === "ai_graded"
          ? "reviewed"
          : activeSubmission.status,
    });
  };

  const handleDeleteSubmission = async (id: string) => {
    const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
    if (!res.ok) return;

    setSubmissions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedSubmissionId === id) {
        setSelectedSubmissionId(next[0]?.id ?? null);
        if (next.length === 0) setIsComposingNew(true);
      }
      return next;
    });
  };

  const handleFollowUpResult = (updatedSubmission: Submission) => {
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === updatedSubmission.id ? updatedSubmission : s
      )
    );
  };

  const handleCopyFeedback = async () => {
    if (!activeSubmission) return;
    const text = formatStudentFeedbackMarkdown(
      activeSubmission,
      activeAssignment
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFeedback(true);
      window.setTimeout(() => setCopiedFeedback(false), 2200);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handlePrintReport = () => {
    if (!activeSubmission) return;
    window.print();
  };

  const handleExportCsv = () => {
    const filtered =
      selectedAssignmentFilter === "all"
        ? submissions
        : submissions.filter(
            (s) => s.assignmentId === selectedAssignmentFilter
          );
    const csv = exportSubmissionsToCsv(filtered, assignments);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `english-grades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="no-print flex h-screen flex-col overflow-hidden">
        <HeaderBar
          configured={configured}
          envConfigured={envConfigured}
          activeSubmission={!isComposingNew ? activeSubmission : null}
          totalSubmissionsCount={submissions.length}
          copiedFeedback={copiedFeedback}
          onNewSubmission={() => setIsComposingNew(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCopyFeedback={handleCopyFeedback}
          onPreviewReport={() => setReportPreviewOpen(true)}
          onPrintReport={handlePrintReport}
          onExportCsv={handleExportCsv}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_390px]">
          {/* Left Queue */}
          <div className="hidden min-h-0 lg:block">
            <SidebarQueue
              assignments={assignments}
              submissions={submissions}
              selectedAssignmentFilter={selectedAssignmentFilter}
              selectedSubmissionId={!isComposingNew ? selectedSubmissionId : null}
              searchQuery={searchQuery}
              onSelectAssignmentFilter={setSelectedAssignmentFilter}
              onSelectSubmission={(id) => {
                setSelectedSubmissionId(id);
                setIsComposingNew(false);
              }}
              onNewSubmission={() => setIsComposingNew(true)}
              onOpenNewAssignmentModal={() => {
                setEditingAssignment(null);
                setAssignmentModalOpen(true);
              }}
              onEditAssignment={(assignment) => {
                setEditingAssignment(assignment);
                setAssignmentModalOpen(true);
              }}
              onDeleteSubmission={handleDeleteSubmission}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Center Canvas */}
          <main className="min-h-0 flex-1">
            {isComposingNew || !activeSubmission ? (
              <NewSubmissionForm
                assignments={assignments}
                presets={presets}
                configured={configured}
                sessionApiKey={sessionApiKey}
                onOpenSettings={() => setSettingsOpen(true)}
                onEditAssignment={(assignment) => {
                  setEditingAssignment(assignment);
                  setAssignmentModalOpen(true);
                }}
                onSubmissionCreated={handleSubmissionCreated}
                onCancel={
                  activeSubmission ? () => setIsComposingNew(false) : undefined
                }
              />
            ) : (
              <AnnotatedPaper
                submission={activeSubmission}
                assignment={activeAssignment}
                onUpdateAnnotations={handleUpdateAnnotations}
                onUpdateQuestionResults={handleUpdateQuestionResults}
              />
            )}
          </main>

          {/* Right Grading & Co-Pilot Panel */}
          {!isComposingNew && activeSubmission && (
            <div className="hidden min-h-0 xl:block">
              <GradingSidebar
                submission={activeSubmission}
                sessionApiKey={sessionApiKey}
                onPatchSubmission={handlePatchSubmission}
                onFollowUpResult={handleFollowUpResult}
              />
            </div>
          )}
        </div>

        {/* Mobile / Tablet Compact Bottom/Drawer Fallback for Grading Sidebar */}
        {!isComposingNew && activeSubmission && (
          <div className="border-t border-[#E6DFD2] bg-white p-4 xl:hidden">
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#1F5E4B]">
                Open Rubric Scorecard, Teacher Comment &amp; Co-Pilot
              </summary>
              <div className="mt-3 max-h-[60vh] overflow-y-auto">
                <GradingSidebar
                  submission={activeSubmission}
                  sessionApiKey={sessionApiKey}
                  onPatchSubmission={handlePatchSubmission}
                  onFollowUpResult={handleFollowUpResult}
                />
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Print-Only Feedback Report */}
      <PrintReport
        submission={!isComposingNew ? activeSubmission : null}
        assignment={activeAssignment}
      />

      {/* Interactive Report Preview Modal */}
      {reportPreviewOpen && !isComposingNew && activeSubmission && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Student Feedback Report Preview"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#DFD5EC] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E3DAF0] bg-[#F7F4FA] px-5 py-3">
              <div className="text-xs font-semibold text-[#552985]">
                RCIS Student Feedback Report — {activeSubmission.studentName}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="rounded-lg bg-[#552985] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#633C8D]"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setReportPreviewOpen(false)}
                  className="rounded-lg border border-[#D7CBE8] bg-white px-3 py-1.5 text-xs font-medium text-[#5D5E60] hover:bg-stone-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#F4F1F8] p-4 sm:p-6">
              <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[#E3DAF0] bg-white shadow-sm">
                <PrintReport
                  embedded
                  submission={activeSubmission}
                  assignment={activeAssignment}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        envConfigured={envConfigured}
        sessionApiKey={sessionApiKey}
        onSaveSessionKey={handleSaveSessionKey}
        onClose={() => setSettingsOpen(false)}
      />

      <AssignmentModal
        isOpen={assignmentModalOpen}
        presets={presets}
        editingAssignment={editingAssignment}
        onClose={() => {
          setAssignmentModalOpen(false);
          setEditingAssignment(null);
        }}
        onCreated={(created) => {
          setAssignments((prev) => [created, ...prev]);
          setSelectedAssignmentFilter(created.id);
        }}
        onUpdated={(updated) => {
          setAssignments((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
          );
        }}
      />
    </>
  );
}
