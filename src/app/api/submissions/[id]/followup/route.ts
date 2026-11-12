import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { askFollowUpWithGemini, formatGeminiError } from "@/lib/gemini";
import {
  findSubmissionById,
  readWorkbenchData,
  updateWorkbenchData,
} from "@/lib/storage";
import type { FollowUpMessage } from "@/lib/types";

const FollowUpSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = FollowUpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a non-empty question for Gemini." },
        { status: 400 }
      );
    }

    const data = await readWorkbenchData();
    const submission = findSubmissionById(data, id);
    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found." },
        { status: 404 }
      );
    }

    const apiKeyOverride = req.headers.get("x-gemini-api-key");
    const result = await askFollowUpWithGemini({
      apiKeyOverride,
      submission,
      teacherMessage: parsed.data.message,
    });

    const now = new Date().toISOString();
    const teacherMsg: FollowUpMessage = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      role: "teacher",
      content: parsed.data.message,
      createdAt: now,
    };
    const assistantMsg: FollowUpMessage = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      role: "assistant",
      content: result.reply,
      createdAt: new Date().toISOString(),
    };

    let updated = null;
    await updateWorkbenchData((current) => {
      const idx = current.submissions.findIndex((s) => s.id === id);
      if (idx === -1) return current;
      const existing = current.submissions[idx];
      const next = {
        ...existing,
        lastInteractionId: result.interactionId ?? existing.lastInteractionId,
        followUps: [...existing.followUps, teacherMsg, assistantMsg],
        updatedAt: new Date().toISOString(),
      };
      updated = next;
      const submissions = [...current.submissions];
      submissions[idx] = next;
      return { ...current, submissions };
    });

    return NextResponse.json({
      submission: updated,
      reply: result.reply,
    });
  } catch (err) {
    const formatted = formatGeminiError(err, "Failed to run follow-up query.");
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.httpStatus }
    );
  }
}
