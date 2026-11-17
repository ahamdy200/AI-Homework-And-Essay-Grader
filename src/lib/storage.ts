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

let blobsDisabledForInstance = false;

async function blobFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await globalThis.fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
    // Avoid @netlify/blobs' built-in 5x5s retry sleeps inside 30s serverless lambdas
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      console.error(
        `[storage] Netlify Blobs returned HTTP ${res.status}; failing fast to fallback storage.`
      );
      return new Response("Netlify Blobs unavailable", { status: 418 });
    }
    return res;
  } catch (err) {
    console.error("[storage] Netlify Blobs fetch failed; failing fast:", err);
    return new Response("Netlify Blobs fetch failed", { status: 418 });
  } finally {
    clearTimeout(timer);
  }
}

function getBlobStoreSafe(baseName: string): Store | null {
  if (blobsDisabledForInstance) return null;

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
    return getStore({ name: storeName, fetch: blobFetch });
  } catch (err) {
    if (err instanceof Error && err.name === "MissingBlobsEnvironmentError") {
      return null;
    }
    throw err;
  }
}

async function withBlobStore<T>(
  baseName: string,
  blobFn: (store: Store) => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  const store = getBlobStoreSafe(baseName);
  if (!store) {
    return fallbackFn();
  }
  try {
    return await blobFn(store);
  } catch (err) {
    console.error(
      `[storage] Netlify Blobs failed for "${baseName}", falling back to ${resolveDataRootDir()}:`,
      err
    );
    blobsDisabledForInstance = true;
    return fallbackFn();
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
  return withBlobStore(
    WORKBENCH_BLOB_STORE,
    async (store) => {
      const existing = (await store.get(WORKBENCH_BLOB_KEY, {
        type: "json",
      })) as WorkbenchData | null;
      if (existing) {
        return { data: normalizeWorkbenchData(existing), needsSeedPersist: false };
      }
      return {
        data: { assignments: createSeedAssignments(), submissions: [] },
        needsSeedPersist: true,
      };
    },
    async () => {
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
  );
}

async function writeWorkbenchDataDirect(data: WorkbenchData): Promise<void> {
  return withBlobStore(
    WORKBENCH_BLOB_STORE,
    async (store) => {
      await store.setJSON(WORKBENCH_BLOB_KEY, data);
    },
    async () => {
      await ensureDirectories();
      const { workbenchFile } = getStoragePaths();
      const tmpPath = `${workbenchFile}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.rename(tmpPath, workbenchFile);
    }
  );
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

  const prepared = files.map((file, i) => {
    const id = `${idPrefix}-${Date.now()}-${i}`;
    const ext = sanitizeExtension(file.originalName, file.mimeType);
    const filename = `${id}${ext}`;
    return {
      id,
      filename,
      file,
      meta: {
        id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.byteLength,
        urlPath: `/api/media/${safeSubDir}/${filename}`,
      } satisfies UploadedAttachment,
    };
  });

  await withBlobStore(
    UPLOADS_BLOB_STORE,
    async (store) => {
      for (const item of prepared) {
        const blobKey = `${safeSubDir}/${item.filename}`;
        const ab = item.file.buffer.buffer.slice(
          item.file.buffer.byteOffset,
          item.file.buffer.byteOffset + item.file.buffer.byteLength
        ) as ArrayBuffer;
        await store.set(blobKey, ab, {
          metadata: {
            originalName: item.file.originalName,
            mimeType: item.file.mimeType,
          },
        });
      }
    },
    async () => {
      await ensureDirectories();
      const targetDir = path.join(getStoragePaths().uploadsDir, safeSubDir);
      await fs.mkdir(targetDir, { recursive: true });
      for (const item of prepared) {
        await fs.writeFile(path.join(targetDir, item.filename), item.file.buffer);
      }
    }
  );

  return prepared.map((p) => p.meta);
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

  return withBlobStore(
    UPLOADS_BLOB_STORE,
    async (store) => {
      const ab = (await store.get(`${safeKey.subDir}/${safeKey.fileName}`, {
        type: "arrayBuffer",
      })) as ArrayBuffer | null;
      return ab ? Buffer.from(ab) : null;
    },
    async () => {
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
  );
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

  await withBlobStore(
    UPLOADS_BLOB_STORE,
    async (store) => {
      await store.delete(`${safeKey.subDir}/${safeKey.fileName}`);
    },
    async () => {
      const resolved = resolveSafeUploadPath(segments);
      if (!resolved) return;
      await fs.rm(resolved, { force: true });
    }
  );
}

export async function deleteAttachmentFolder(folderId: string): Promise<void> {
  const safeSubDir = folderId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSubDir) return;

  await withBlobStore(
    UPLOADS_BLOB_STORE,
    async (store) => {
      const { blobs } = await store.list({ prefix: `${safeSubDir}/` });
      await Promise.all(blobs.map((b) => store.delete(b.key)));
    },
    async () => {
      const targetDir = path.join(getStoragePaths().uploadsDir, safeSubDir);
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  );
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
