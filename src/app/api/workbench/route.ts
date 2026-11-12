import { NextResponse } from "next/server";
import { RUBRIC_PRESETS, SAMPLE_ESSAYS } from "@/lib/presets";
import { readWorkbenchData } from "@/lib/storage";

export async function GET() {
  try {
    const data = await readWorkbenchData();
    return NextResponse.json({
      assignments: data.assignments,
      submissions: data.submissions,
      presets: RUBRIC_PRESETS,
      sampleEssays: SAMPLE_ESSAYS,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load workbench data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
