import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import {
  deleteAttachmentFolder,
  deleteSingleAttachmentFile,
  readWorkbenchData,
  saveAnswerKeyAttachments,
  updateWorkbenchData,
} from "@/lib/storage";
import type { Assignment, RubricCriterion } from "@/lib/types";
import {
  parseUploadedFiles,
  UploadValidationError,
  type ParsedMediaFile,
} from "@/lib/uploads";

const CriterionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  maxScore: z.number().positive().max(1000),
});

const AssignmentPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  prompt: z.string().trim().max(4000).default(""),
  gradeLevel: z.string().trim().min(1).max(60),
  rubricName: z.string().trim().min(1).max(120),
  modelAnswerText: z.string().trim().max(12000).default(""),
  criteria: z.array(CriterionSchema).min(1).max(12),
});

async function parseAssignmentRequest(req: NextRequest): Promise<{
  id?: string;
  payload: z.infer<typeof AssignmentPayloadSchema>;
  modelAnswerMedia: ParsedMediaFile[];
  removedAttachmentIds: string[];
}> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const id = String(formData.get("id") || "").trim() || undefined;
    const rawCriteria = String(formData.get("criteria") || "[]");
    const rawRemoved = String(formData.get("removedAttachmentIds") || "[]");

    let parsedCriteria: RubricCriterion[] = [];
    let removedAttachmentIds: string[] = [];
    try {
      parsedCriteria = JSON.parse(rawCriteria) as RubricCriterion[];
      removedAttachmentIds = JSON.parse(rawRemoved) as string[];
    } catch {
      throw new UploadValidationError("Invalid JSON in criteria or attachment list.");
    }

    const parsedKeyFiles = await parseUploadedFiles(
      formData.getAll("modelAnswerFiles"),
      String(formData.get("modelAnswerText") || "")
    );

    const validated = AssignmentPayloadSchema.safeParse({
      title: String(formData.get("title") || ""),
      prompt: String(formData.get("prompt") || ""),
      gradeLevel: String(formData.get("gradeLevel") || "Grades 6–12"),
      rubricName: String(formData.get("rubricName") || "Custom Rubric"),
      modelAnswerText: parsedKeyFiles.text,
      criteria: parsedCriteria,
    });

    if (!validated.success) {
      throw new UploadValidationError("Invalid assignment fields.");
    }

    return {
      id,
      payload: validated.data,
      modelAnswerMedia: parsedKeyFiles.mediaFiles,
      removedAttachmentIds: Array.isArray(removedAttachmentIds)
        ? removedAttachmentIds
        : [],
    };
  }

  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id.trim() : undefined;
  const validated = AssignmentPayloadSchema.safeParse(body);
  if (!validated.success) {
    throw new UploadValidationError("Invalid assignment fields.");
  }

  return {
    id,
    payload: validated.data,
    modelAnswerMedia: [],
    removedAttachmentIds: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { payload, modelAnswerMedia } = await parseAssignmentRequest(req);
    const assignmentId = `assign-${crypto.randomUUID().slice(0, 8)}`;
    const savedAttachments = await saveAnswerKeyAttachments(
      assignmentId,
      modelAnswerMedia
    );

    const newAssignment: Assignment = {
      id: assignmentId,
      title: payload.title,
      prompt: payload.prompt,
      gradeLevel: payload.gradeLevel,
      rubricName: payload.rubricName,
      criteria: payload.criteria,
      modelAnswerText: payload.modelAnswerText,
      modelAnswerAttachments: savedAttachments,
      createdAt: new Date().toISOString(),
    };

    await updateWorkbenchData((current) => ({
      ...current,
      assignments: [newAssignment, ...current.assignments],
    }));

    return NextResponse.json({ assignment: newAssignment }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to create assignment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, payload, modelAnswerMedia, removedAttachmentIds } =
      await parseAssignmentRequest(req);

    if (!id) {
      return NextResponse.json(
        { error: "Assignment id is required." },
        { status: 400 }
      );
    }

    const current = await readWorkbenchData();
    const existing = current.assignments.find((a) => a.id === id);
    if (!existing) {
      return NextResponse.json(
        { error: "Assignment not found." },
        { status: 404 }
      );
    }

    const removedSet = new Set(removedAttachmentIds);
    const filesToDelete = existing.modelAnswerAttachments.filter((att) =>
      removedSet.has(att.id)
    );
    const retainedAttachments = existing.modelAnswerAttachments.filter(
      (att) => !removedSet.has(att.id)
    );

    const newlySaved = await saveAnswerKeyAttachments(id, modelAnswerMedia);
    for (const oldFile of filesToDelete) {
      await deleteSingleAttachmentFile(oldFile);
    }

    const updatedAssignment: Assignment = {
      ...existing,
      title: payload.title,
      prompt: payload.prompt,
      gradeLevel: payload.gradeLevel,
      rubricName: payload.rubricName,
      criteria: payload.criteria,
      modelAnswerText: payload.modelAnswerText,
      modelAnswerAttachments: [...retainedAttachments, ...newlySaved],
    };

    await updateWorkbenchData((wb) => ({
      ...wb,
      assignments: wb.assignments.map((a) =>
        a.id === id ? updatedAssignment : a
      ),
    }));

    return NextResponse.json({ assignment: updatedAssignment });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to update assignment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Assignment id is required." },
        { status: 400 }
      );
    }

    let found = false;
    await updateWorkbenchData((current) => {
      const exists = current.assignments.some((a) => a.id === id);
      if (!exists) return current;
      found = true;
      return {
        ...current,
        assignments: current.assignments.filter((a) => a.id !== id),
      };
    });

    if (!found) {
      return NextResponse.json(
        { error: "Assignment not found." },
        { status: 404 }
      );
    }

    await deleteAttachmentFolder(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete assignment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
