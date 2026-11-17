import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readUploadFileBuffer, resolveSafeUploadKey } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await context.params;
    const safeKey = resolveSafeUploadKey(segments);
    if (!safeKey) {
      return NextResponse.json({ error: "Invalid media path." }, { status: 400 });
    }

    const fileBuffer = await readUploadFileBuffer(segments);
    if (!fileBuffer) {
      return NextResponse.json({ error: "Media file not found." }, { status: 404 });
    }

    const ext = path.extname(safeKey.fileName).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read media file." }, { status: 500 });
  }
}
