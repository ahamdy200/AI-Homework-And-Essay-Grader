export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 6;

export interface ParsedMediaFile {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export function normalizeMimeType(file: File): string {
  const raw = (file.type || "").toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw) return raw;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "image/jpeg";
}

/**
 * Validates uploaded images, PDFs, and text files, merging any .txt/.md content
 * into text and returning binary buffers for images and PDFs.
 */
export async function parseUploadedFiles(
  entries: FormDataEntryValue[],
  initialText = "",
  maxFiles = MAX_UPLOAD_FILES
): Promise<{ text: string; mediaFiles: ParsedMediaFile[] }> {
  const files = entries.filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length > maxFiles) {
    throw new UploadValidationError(
      `Please upload at most ${maxFiles} files.`
    );
  }

  let combinedText = initialText.trim();
  const mediaFiles: ParsedMediaFile[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new UploadValidationError(
        `"${file.name}" exceeds the 25 MB limit.`
      );
    }

    const mimeType = normalizeMimeType(file);
    if (mimeType === "text/plain" || mimeType === "text/markdown") {
      const textChunk = (await file.text()).trim();
      if (textChunk) {
        combinedText = combinedText
          ? `${combinedText}\n\n${textChunk}`
          : textChunk;
      }
      continue;
    }

    if (mimeType !== "application/pdf" && !ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new UploadValidationError(
        `Unsupported file type for "${file.name}". Upload PNG, JPG, WEBP, HEIC, PDF, or TXT files.`
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    mediaFiles.push({
      originalName: file.name,
      mimeType,
      buffer: Buffer.from(arrayBuffer),
    });
  }

  return { text: combinedText, mediaFiles };
}
