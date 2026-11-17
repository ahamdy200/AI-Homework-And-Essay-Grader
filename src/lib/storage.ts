import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { getStore, type Store } from "@netlify/blobs";
import { RUBRIC_PRESETS } from "./presets";
import type {
  Assignment,
  Submission,
  UploadedAttachment,
  WorkbenchData,
} from "./types";
import type { ParsedMediaFile } from "./uploads";

const WORKBENCH_BLOB_STORE = "redpen-workbench";
const WORKBENCH_BLOB_KEY = "workbench";
const UPLOADS_BLOB_STORE = "redpen-uploads";

export function resolveDataRootDir(env: {
  netlify?: boolean;
  lambda?: boolean;
  cwd?: string;
  tmpDir?: string;
} = {}): string {
  const cwd = env.cwd ?? process.cwd();
  const isServerless = Boolean(
    env.netlify ??
      (process.env.NETLIFY ||
        env.lambda ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.LAMBDA_TASK_ROOT ||
        cwd.startsWith("/var/task"))
  );
  if (isServerless) {
    return path.join(env.tmpDir ?? os.tmpdir(), "redpen-data");
  }
  return path.join(cwd, "data");
}

function getStoragePaths() {
  const dataDir = resolveDataRootDir();
  return {
    dataDir,
    workbenchFile: path.join(dataDir, "workbench.json"),
    uploadsDir: path.join(dataDir, "uploads"),
  };
}

function getBlobStoreSafe(baseName: string): Store | null {
  const hasNetlifyRuntime = Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      (globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext
  );
  if (!hasNetlifyRuntime) return null;

  const ctx = process.env.CONTEXT;
  const storeName =
    !ctx || ctx === "production" ? baseName : `${baseName}-preview`;

  try {
    return getStore({ name: storeName, consistency: "strong" });
  } catch (err) {
    if (err instanceof Error && err.name === "MissingBlobsEnvironmentError") {
      return null;
    }
    throw err;
  }
}

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

function normalizeWorkbenchData(parsed: WorkbenchData): WorkbenchData {
  return {
    assignments: Array.isArray(parsed.assignments)
      ? parsed.assignments.map(normalizeAssignment)
      : createSeedAssignments(),
    submissions: Array.isArray(parsed.submissions)
      ? parsed.submissions.map(normalizeSubmission)
      : [],
  };
}

async function ensureDirectories(): Promise<void> {
  const { dataDir, uploadsDir } = getStoragePaths();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
}

async function readWorkbenchDataDirect(): Promise<{
  data: WorkbenchData;
  needsSeedPersist: boolean;
}> {
  const blobStore = getBlobStoreSafe(WORKBENCH_BLOB_STORE);
  if (blobStore) {
    const existing = (await blobStore.get(WORKBENCH_BLOB_KEY, {
      type: "json",
      consistency: "strong",
    })) as WorkbenchData | null;
    if (existing) {
      return { data: normalizeWorkbenchData(existing), needsSeedPersist: false };
    }
    return {
      data: { assignments: createSeedAssignments(), submissions: [] },
      needsSeedPersist: true,
    };
  }

  await ensureDirectories();
  const { workbenchFile } = getStoragePaths();
  try {
    const raw = await fs.readFile(
      /*turbopackIgnore: true*/ workbenchFile,
      "utf-8"
    );
    const parsed = JSON.parse(raw) as WorkbenchData;
    return { data: normalizeWorkbenchData(parsed), needsSeedPersist: false };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return {
        data: { assignments: createSeedAssignments(), submissions: [] },
        needsSeedPersist: true,
      };
    }
    throw err;
  }
}

async function writeWorkbenchDataDirect(data: WorkbenchData): Promise<void> {
  const blobStore = getBlobStoreSafe(WORKBENCH_BLOB_STORE);
  if (blobStore) {
    await blobStore.setJSON(WORKBENCH_BLOB_KEY, data);
    return;
  }

  await ensureDirectories();
  const { workbenchFile } = getStoragePaths();
  const tmpPath = `${workbenchFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, workbenchFile);
}

export async function readWorkbenchData(): Promise<WorkbenchData> {
  const { data, needsSeedPersist } = await readWorkbenchDataDirect();
  if (needsSeedPersist) {
    return updateWorkbenchData((current) => current);
  }
  return data;
}

export async function writeWorkbenchData(data: WorkbenchData): Promise<void> {
  const runWrite = () => writeWorkbenchDataDirect(data);
  writeQueue = writeQueue.then(runWrite, runWrite);
  return writeQueue;
}

export async function updateWorkbenchData(
  updater: (current: WorkbenchData) => WorkbenchData
): Promise<WorkbenchData> {
  let result!: WorkbenchData;
  const runUpdate = async () => {
    const { data: current } = await readWorkbenchDataDirect();
    result = updater(current);
    await writeWorkbenchDataDirect(result);
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
  const safeSubDir = folderId.replace(/[^a-zA-Z0-9_-]/g, "");
  const blobStore = getBlobStoreSafe(UPLOADS_BLOB_STORE);

  let targetDir = "";
  if (!blobStore) {
    await ensureDirectories();
    targetDir = path.join(getStoragePaths().uploadsDir, safeSubDir);
    await fs.mkdir(targetDir, { recursive: true });
  }

  const attachments: UploadedAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `${idPrefix}-${Date.now()}-${i}`;
    const ext = sanitizeExtension(file.originalName, file.mimeType);
    const filename = `${id}${ext}`;
    if (blobStore) {
      const blobKey = `${safeSubDir}/${filename}`;
      const ab = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength
      ) as ArrayBuffer;
      await blobStore.set(blobKey, ab, {
        metadata: {
          originalName: file.originalName,
          mimeType: file.mimeType,
        },
      });
    } else {
      const diskPath = path.join(targetDir, filename);
      await fs.writeFile(diskPath, file.buffer);
    }
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

export function resolveSafeUploadKey(
  segments: string[]
): { subDir: string; fileName: string } | null {
  if (segments.length !== 2) return null;
  const [subDir, fileName] = segments;
  if (
    !/^[a-zA-Z0-9_-]+$/.test(subDir) ||
    !/^[a-zA-Z0-9._-]+$/.test(fileName)
  ) {
    return null;
  }
  return { subDir, fileName };
}

export async function readUploadFileBuffer(
  segments: string[]
): Promise<Buffer | null> {
  const safeKey = resolveSafeUploadKey(segments);
  if (!safeKey) return null;

  const blobStore = getBlobStoreSafe(UPLOADS_BLOB_STORE);
  if (blobStore) {
    const ab = (await blobStore.get(
      `${safeKey.subDir}/${safeKey.fileName}`,
      { type: "arrayBuffer", consistency: "strong" }
    )) as ArrayBuffer | null;
    return ab ? Buffer.from(ab) : null;
  }

  const resolved = resolveSafeUploadPath(segments);
  if (!resolved) return null;
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ resolved);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") return null;
    throw err;
  }
}

export async function readStoredAttachments(
  attachments: UploadedAttachment[]
): Promise<ParsedMediaFile[]> {
  const loaded: ParsedMediaFile[] = [];
  for (const att of attachments) {
    const cleanRel = att.urlPath.replace(/^\/api\/media\//, "");
    const segments = cleanRel.split("/").filter(Boolean);
    try {
      const buffer = await readUploadFileBuffer(segments);
      if (!buffer) continue;
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
  const safeKey = resolveSafeUploadKey(segments);
  if (!safeKey) return;

  const blobStore = getBlobStoreSafe(UPLOADS_BLOB_STORE);
  if (blobStore) {
    await blobStore.delete(`${safeKey.subDir}/${safeKey.fileName}`);
    return;
  }

  const resolved = resolveSafeUploadPath(segments);
  if (!resolved) return;
  await fs.rm(resolved, { force: true });
}

export async function deleteAttachmentFolder(folderId: string): Promise<void> {
  const safeSubDir = folderId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSubDir) return;

  const blobStore = getBlobStoreSafe(UPLOADS_BLOB_STORE);
  if (blobStore) {
    const { blobs } = await blobStore.list({ prefix: `${safeSubDir}/` });
    await Promise.all(blobs.map((b) => blobStore.delete(b.key)));
    return;
  }

  const targetDir = path.join(getStoragePaths().uploadsDir, safeSubDir);
  await fs.rm(targetDir, { recursive: true, force: true });
}

export async function deleteSubmissionFiles(submissionId: string): Promise<void> {
  return deleteAttachmentFolder(submissionId);
}

export function resolveSafeUploadPath(segments: string[]): string | null {
  const safeKey = resolveSafeUploadKey(segments);
  if (!safeKey) return null;
  const { uploadsDir } = getStoragePaths();
  const resolved = path.resolve(
    /*turbopackIgnore: true*/ uploadsDir,
    safeKey.subDir,
    safeKey.fileName
  );
  const root = path.resolve(/*turbopackIgnore: true*/ uploadsDir);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function findSubmissionById(
  data: WorkbenchData,
  id: string
): Submission | undefined {
  return data.submissions.find((s) => s.id === id);
}
