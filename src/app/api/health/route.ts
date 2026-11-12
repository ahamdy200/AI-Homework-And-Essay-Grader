import { NextRequest, NextResponse } from "next/server";
import {
  formatGeminiError,
  resolveApiKey,
  testGeminiConnection,
} from "@/lib/gemini";
import { GEMINI_MODEL } from "@/lib/types";

export async function GET(req: NextRequest) {
  const headerKey = req.headers.get("x-gemini-api-key");
  const envConfigured = Boolean(resolveApiKey(null));
  const sessionConfigured = Boolean(headerKey?.trim());

  return NextResponse.json({
    ok: true,
    model: GEMINI_MODEL,
    envConfigured,
    configured: envConfigured || sessionConfigured,
  });
}

export async function POST(req: NextRequest) {
  try {
    const headerKey = req.headers.get("x-gemini-api-key");
    const result = await testGeminiConnection(headerKey);
    return NextResponse.json(result);
  } catch (err) {
    const formatted = formatGeminiError(
      err,
      "Failed to verify Gemini connection."
    );
    return NextResponse.json(
      { ok: false, error: formatted.message },
      { status: formatted.httpStatus }
    );
  }
}
