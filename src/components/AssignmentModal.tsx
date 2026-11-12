"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import type { Assignment, RubricCriterion, RubricPreset } from "@/lib/types";
import { AnswerKeyEditor } from "./AnswerKeyEditor";

interface AssignmentModalProps {
  isOpen: boolean;
  presets: RubricPreset[];
  editingAssignment?: Assignment | null;
  onClose: () => void;
  onCreated: (assignment: Assignment) => void;
  onUpdated: (assignment: Assignment) => void;
}

export function AssignmentModal({
  isOpen,
  presets,
  editingAssignment,
  onClose,
  onCreated,
  onUpdated,
}: AssignmentModalProps) {
  const [title, setTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("Grade 8");
  const [prompt, setPrompt] = useState("");
  const [rubricName, setRubricName] = useState(
    presets[0]?.name || "Custom Rubric"
  );
  const [criteria, setCriteria] = useState<RubricCriterion[]>(
    presets[0]?.criteria ?? []
  );
  const [modelAnswerText, setModelAnswerText] = useState("");
  const [modelAnswerFiles, setModelAnswerFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setModelAnswerFiles([]);
    setRemovedAttachmentIds([]);

    if (editingAssignment) {
      setTitle(editingAssignment.title);
      setGradeLevel(editingAssignment.gradeLevel);
      setPrompt(editingAssignment.prompt);
      setRubricName(editingAssignment.rubricName);
      setCriteria(editingAssignment.criteria.map((c) => ({ ...c })));
      setModelAnswerText(editingAssignment.modelAnswerText || "");
    } else {
      setTitle("");
      setGradeLevel(presets[0]?.gradeLevel || "Grade 8");
      setPrompt("");
      setRubricName(presets[0]?.name || "Custom Rubric");
      setCriteria(
        (presets[0]?.criteria ?? [
          {
            id: "criterion-1",
            name: "Ideas & Accuracy",
            description: "Accurate answers and clear supporting details.",
            maxScore: 50,
          },
          {
            id: "criterion-2",
            name: "Grammar & Mechanics",
            description: "Sentence boundaries, punctuation, and spelling.",
            maxScore: 50,
          },
        ]).map((c) => ({ ...c }))
      );
      setModelAnswerText("");
    }
  }, [isOpen, editingAssignment, presets]);

  if (!isOpen) return null;

  const isEditing = Boolean(editingAssignment);

  const handleLoadPreset = (presetId: string) => {
    const found = presets.find((p) => p.id === presetId);
    if (!found) return;
    setRubricName(found.name);
    setGradeLevel(found.gradeLevel);
    setCriteria(found.criteria.map((c) => ({ ...c })));
  };

  const handleAddCriterion = () => {
    setCriteria((prev) => [
      ...prev,
      {
        id: `crit-${Date.now()}`,
        name: "",
        description: "",
        maxScore: 20,
      },
    ]);
  };

  const handleRemoveCriterion = (idx: number) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleRemoveExisting = (attachmentId: string) => {
    setRemovedAttachmentIds((prev) =>
      prev.includes(attachmentId)
        ? prev.filter((id) => id !== attachmentId)
        : [...prev, attachmentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Assignment or quiz title is required.");
      return;
    }

    const cleanedCriteria = criteria
      .map((c, idx) => ({
        id: c.id || `crit-${idx + 1}`,
        name: c.name.trim(),
        description: c.description.trim(),
        maxScore: Number(c.maxScore) || 10,
      }))
      .filter((c) => c.name.length > 0);

    if (cleanedCriteria.length === 0) {
      setError("Add at least one rubric criterion.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      if (editingAssignment) {
        formData.append("id", editingAssignment.id);
        formData.append(
          "removedAttachmentIds",
          JSON.stringify(removedAttachmentIds)
        );
      }
      formData.append("title", title.trim());
      formData.append("prompt", prompt.trim());
      formData.append("gradeLevel", gradeLevel.trim() || "Grades 6–12");
      formData.append("rubricName", rubricName.trim() || "Custom Rubric");
      formData.append("criteria", JSON.stringify(cleanedCriteria));
      formData.append("modelAnswerText", modelAnswerText);

      for (const file of modelAnswerFiles) {
        formData.append("modelAnswerFiles", file);
      }

      const res = await fetch("/api/assignments", {
        method: isEditing ? "PATCH" : "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save assignment.");
      }

      if (isEditing) {
        onUpdated(json.assignment);
      } else {
        onCreated(json.assignment);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save assignment."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const totalPoints = criteria.reduce(
    (sum, c) => sum + (Number(c.maxScore) || 0),
    0
  );

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E6DFD2] bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E6DFD2] pb-3">
          <h2 className="font-serif-paper text-lg font-semibold text-stone-900">
            {isEditing
              ? "Edit Assignment, Rubric & Answer Key"
              : "Create Assignment, Rubric & Answer Key"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Assignment / Quiz Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Unit 3 Grammar & Reading Quiz"
                required
                className="w-full rounded-xl border border-[#E6DFD2] px-3 py-2 text-sm outline-none focus:border-[#1F5E4B]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Grade Level
              </label>
              <input
                type="text"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="e.g., Grade 9"
                className="w-full rounded-xl border border-[#E6DFD2] px-3 py-2 text-sm outline-none focus:border-[#1F5E4B]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">
              Assignment Prompt / Quiz Questions
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste the essay prompt or quiz questions students were given..."
              className="w-full rounded-xl border border-[#E6DFD2] px-3 py-2 text-sm outline-none focus:border-[#1F5E4B]"
            />
          </div>

          {/* Dedicated Model Answer / Answer Key Section */}
          <AnswerKeyEditor
            modelAnswerText={modelAnswerText}
            onChangeText={setModelAnswerText}
            newFiles={modelAnswerFiles}
            onChangeNewFiles={setModelAnswerFiles}
            existingAttachments={editingAssignment?.modelAnswerAttachments}
            removedAttachmentIds={removedAttachmentIds}
            onToggleRemoveExisting={handleToggleRemoveExisting}
          />

          <div className="rounded-xl border border-[#E6DFD2] bg-[#FAF8F4] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-stone-800">
                  Rubric Criteria (Total: {totalPoints} pts)
                </span>
              </div>
              <select
                onChange={(e) => handleLoadPreset(e.target.value)}
                defaultValue=""
                className="rounded-lg border border-[#E6DFD2] bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
              >
                <option value="" disabled>
                  Load from preset...
                </option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2.5">
              {criteria.map((crit, idx) => (
                <div
                  key={crit.id}
                  className="grid grid-cols-12 items-start gap-2 rounded-lg border border-[#E6DFD2] bg-white p-2.5"
                >
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={crit.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCriteria((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, name: val } : c
                          )
                        );
                      }}
                      placeholder="Criterion name"
                      className="w-full rounded border border-[#E6DFD2] px-2 py-1 text-xs font-medium outline-none focus:border-[#1F5E4B]"
                    />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={crit.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCriteria((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, description: val } : c
                          )
                        );
                      }}
                      placeholder="Description for AI grader"
                      className="w-full rounded border border-[#E6DFD2] px-2 py-1 text-xs outline-none focus:border-[#1F5E4B]"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={crit.maxScore}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCriteria((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, maxScore: val } : c
                          )
                        );
                      }}
                      className="font-mono-score w-full rounded border border-[#E6DFD2] px-1.5 py-1 text-right text-xs outline-none focus:border-[#1F5E4B]"
                      aria-label="Max points"
                    />
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(idx)}
                        className="p-1 text-stone-400 hover:text-red-600"
                        title="Remove criterion"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddCriterion}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1F5E4B] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Criterion</span>
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#E6DFD2] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#E6DFD2] px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F5E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#174839] disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isEditing ? "Save Changes" : "Save Assignment"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
