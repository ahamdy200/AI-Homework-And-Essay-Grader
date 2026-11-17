import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RUBRIC_PRESETS } from "./presets";
import type {
  Assignment,
  Submission,
  UploadedAttachment,
  WorkbenchData,
} from "./types";
import type { ParsedMediaFile } from "./uploads";

const DATA_DIR = path.join(process.cwd(), "data");
const WORKBENCH_FILE = path.join(DATA_DIR, "workbench.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

let writeQueue: Promise<void> = Promise.resolve();

/** Wait for all queued writes to finish. Exported for tests only. */
export async function _drainWriteQueue(): Promise<void> {
  await writeQueue;
}

function createSeedAssignments(): Assignment[] {
  const middlePreset =
    RUBRIC_PRESETS.find((r) => r.id === "middle-school-essay") ??
    RUBRIC_PRESETS[0];
  const highPreset =
    RUBRIC_PRESETS.find((r) => r.id === "high-school-argumentative") ??
    RUBRIC_PRESETS[0];
  const grammarPreset =
    RUBRIC_PRESETS.find((r) => r.id === "grammar-homework-check") ??
    RUBRIC_PRESETS[0];
  const now = new Date().toISOString();

  return [
    {
      id: "assign-persuasive-tech",
      title: "Argumentative Essay: Smartphones in School",
      prompt:
        "Write a 3–4 paragraph persuasive essay answering whether middle school students should be allowed to bring smartphones to school. State a clear claim, provide two supporting reasons with examples, and address a counterargument.",
      gradeLevel: "Grade 8",
      rubricName: middlePreset.name,
      criteria: middlePreset.criteria,
      modelAnswerText: "",
      modelAnswerAttachments: [],
      createdAt: now,
    },
    {
      id: "assign-literary-analysis",
      title: "Literary Analysis: Symbolism in The Great Gatsby",
      prompt:
        "Analyze how F. Scott Fitzgerald uses the green light as an evolving symbol throughout The Great Gatsby. Support your thesis with specific textual references.",
      gradeLevel: "Grade 10",
      rubricName: highPreset.name,
      criteria: highPreset.criteria,
      modelAnswerText: "",
      modelAnswerAttachments: [],
      createdAt: now,
    },
    {
      id: "assign-grammar-hw",
      title: "Weekly Reading & Grammar Check",
      prompt:
        "Answer both reading comprehension questions in complete sentences. Check verb tenses, comma placement, and apostrophes.",
      gradeLevel: "Grades 6–12",
      rubricName: grammarPreset.name,
      criteria: grammarPreset.criteria,
      modelAnswerText: "",
      modelAnswerAttachments: [],
      createdAt: now,
    },
    (() => {
      const mixedPreset =
        RUBRIC_PRESETS.find((p) => p.id === "mixed-mcq-essay") ??
        RUBRIC_PRESETS[0];
      return {
        id: "assign-mixed-quiz",
        title: "Mixed Quiz & Essay (MCQs + Question 5 Essay)",
        prompt:
          "Answer numbered multiple-choice questions against the key (e.g., 1. c, 2. B, 3. D) and write a developed response for Question 5.",
        gradeLevel: "Grades 6–12",
        rubricName: mixedPreset.name,
        criteria: mixedPreset.criteria,
        modelAnswerText:
          "1. c\n2. B\n3. D\n4. A\n5. Essay: Explain the central conflict and include concrete evidence from the text.",
        modelAnswerAttachments: [],
        createdAt: now,
      };
    })(),
  ];
}

function normalizeAssignment(raw: Assignment): Assignment {
  return {
    ...raw,
    modelAnswerText: typeof raw.modelAnswerText === "string" ? raw.modelAnswerText : "",
    modelAnswerAttachments: Array.isArray(raw.modelAnswerAttachments)
      ? raw.modelAnswerAttachments
      : [],
  };
}

function normalizeSubmission(raw: WorkbenchData["submissions"][number]) {
  return {
    ...raw,
    questionResults: Array.isArray(raw.questionResults)
      ? raw.questionResults
      : [],
  };
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function readWorkbenchData(): Promise<WorkbenchData> {
  await ensureDirectories();
  try {
    const raw = await fs.readFile(WORKBENCH_FILE, "utf-8");
    const parsed = JSON.parse(raw) as WorkbenchData;
    return {
      assignments: Array.isArray(parsed.assignments)
        ? parsed.assignments.map(normalizeAssignment)
        : createSeedAssignments(),
      submissions: Array.isArray(parsed.submissions)
        ? parsed.submissions.map(normalizeSubmission)
        : [],
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      const seed: WorkbenchData = {
        assignments: createSeedAssignments(),
        submissions: [],
      };
      await writeWorkbenchData(seed);
      return seed;
    }
    throw err;
  }
}

export async function writeWorkbenchData(data: WorkbenchData): Promise<void> {
  await ensureDirectories();
  const runWrite = async () => {
    const tmpPath = `${WORKBENCH_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, WORKBENCH_FILE);
  };
  writeQueue = writeQueue.then(runWrite, runWrite);
  return writeQueue;
}

export async function updateWorkbenchData(
  updater: (current: WorkbenchData) => WorkbenchData
): Promise<WorkbenchData> {
  let result!: WorkbenchData;
  const runUpdate = async () => {
    // Inline the read to avoid deadlocking on the shared writeQueue
    await ensureDirectories();
    let current: WorkbenchData;
    try {
      const raw = await fs.readFile(WORKBENCH_FILE, "utf-8");
      const parsed = JSON.parse(raw) as WorkbenchData;
      current = {
        assignments: Array.isArray(parsed.assignments)
          ? parsed.assignments.map(normalizeAssignment)
          : createSeedAssignments(),
        submissions: Array.isArray(parsed.submissions)
          ? parsed.submissions.map(normalizeSubmission)
          : [],
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        current = { assignments: createSeedAssignments(), submissions: [] };
      } else {
        throw err;
      }
    }
    result = updater(current);
    const tmpPath = `${WORKBENCH_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(result, null, 2), "utf-8");
    await fs.rename(tmpPath, WORKBENCH_FILE);
  };
  writeQueue = writeQueue.then(runUpdate, runUpdate);
  await writeQueue;
  return result;
}

function sanitizeExtension(originalName: string, mimeType: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (ext && ext.length <= 8) return ext;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

export async function saveAttachmentsInFolder(
  folderId: string,
  files: ParsedMediaFile[],
  idPrefix = "att"
): Promise<UploadedAttachment[]> {
  if (files.length === 0) return [];
  await ensureDirectories();
  const safeSubDir = folderId.replace(/[^a-zA-Z0-9_-]/g, "");
  const targetDir = path.join(UPLOADS_DIR, safeSubDir);
  await fs.mkdir(targetDir, { recursive: true });

  const attachments: UploadedAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `${idPrefix}-${Date.now()}-${i}`;
    const ext = sanitizeExtension(file.originalName, file.mimeType);
    const filename = `${id}${ext}`;
    const diskPath = path.join(targetDir, filename);
    await fs.writeFile(diskPath, file.buffer);
    attachments.push({
      id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.byteLength,
      urlPath: `/api/media/${safeSubDir}/${filename}`,
    });
  }
  return attachments;
}

export async function saveSubmissionAttachments(
  submissionId: string,
  files: ParsedMediaFile[]
): Promise<UploadedAttachment[]> {
  return saveAttachmentsInFolder(submissionId, files, "att");
}

export async function saveAnswerKeyAttachments(
  ownerId: string,
  files: ParsedMediaFile[]
): Promise<UploadedAttachment[]> {
  return saveAttachmentsInFolder(ownerId, files, "key");
}

export async function readStoredAttachments(
  attachments: UploadedAttachment[]
): Promise<ParsedMediaFile[]> {
  const loaded: ParsedMediaFile[] = [];
  for (const att of attachments) {
    const cleanRel = att.urlPath.replace(/^\/api\/media\//, "");
    const segments = cleanRel.split("/").filter(Boolean);
    const resolved = resolveSafeUploadPath(segments);
    if (!resolved) continue;
    try {
      const buffer = await fs.readFile(resolved);
      loaded.push({
        originalName: att.originalName,
        mimeType: att.mimeType,
        buffer,
      });
    } catch {
      // Skip missing file gracefully
    }
  }
  return loaded;
}

export async function deleteSingleAttachmentFile(
  attachment: UploadedAttachment
): Promise<void> {
  const cleanRel = attachment.urlPath.replace(/^\/api\/media\//, "");
  const segments = cleanRel.split("/").filter(Boolean);
  const resolved = resolveSafeUploadPath(segments);
  if (!resolved) return;
  await fs.rm(resolved, { force: true });
}

export async function deleteAttachmentFolder(folderId: string): Promise<void> {
  const safeSubDir = folderId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSubDir) return;
  const targetDir = path.join(UPLOADS_DIR, safeSubDir);
  await fs.rm(targetDir, { recursive: true, force: true });
}

export async function deleteSubmissionFiles(submissionId: string): Promise<void> {
  return deleteAttachmentFolder(submissionId);
}

export function resolveSafeUploadPath(segments: string[]): string | null {
  if (segments.length !== 2) return null;
  const [subDir, fileName] = segments;
  if (
    !/^[a-zA-Z0-9_-]+$/.test(subDir) ||
    !/^[a-zA-Z0-9._-]+$/.test(fileName)
  ) {
    return null;
  }
  const resolved = path.resolve(UPLOADS_DIR, subDir, fileName);
  const root = path.resolve(UPLOADS_DIR);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function findSubmissionById(
  data: WorkbenchData,
  id: string
): Submission | undefined {
  return data.submissions.find((s) => s.id === id);
}
