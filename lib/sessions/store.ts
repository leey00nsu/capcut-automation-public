import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { z } from "zod";

import { getPlanSnapshotsRootPath } from "@/lib/plans/snapshot";
import type {
  PlanningSession,
  PlanningSessionJob,
  PlanningSessionSource,
  TranscriptionSummary,
} from "@/types/session";

const nonEmptyStringSchema = z.string().trim().min(1);

const transcriptSegmentSchema = z.object({
  id: nonEmptyStringSchema,
  start: nonEmptyStringSchema,
  end: nonEmptyStringSchema,
  text: nonEmptyStringSchema,
  speaker: nonEmptyStringSchema.optional(),
});

const transcriptionSummarySchema: z.ZodType<TranscriptionSummary> = z.object({
  mode: z.enum(["manual_file", "local_stt", "api_stt"]),
  engine: nonEmptyStringSchema,
  model: nonEmptyStringSchema.optional(),
  language: nonEmptyStringSchema.optional(),
  usage: z
    .object({
      provider: z.enum(["local", "openai"]),
      model: nonEmptyStringSchema,
      totalTokens: z.number().nonnegative().optional(),
      inputTokens: z.number().nonnegative().optional(),
      outputTokens: z.number().nonnegative().optional(),
      audioSeconds: z.number().nonnegative().optional(),
      estimatedCostUsd: z.number().nonnegative().optional(),
      pricingReference: nonEmptyStringSchema.optional(),
      note: nonEmptyStringSchema.optional(),
    })
    .optional(),
  artifactPaths: z.object({
    transcriptPath: nonEmptyStringSchema,
    segmentsPath: nonEmptyStringSchema.optional(),
    metadataPath: nonEmptyStringSchema,
    originalInputPath: nonEmptyStringSchema.optional(),
  }),
  segments: z.array(transcriptSegmentSchema).optional(),
});

const planningSessionJobSchema: z.ZodType<PlanningSessionJob> = z.union([
  z.object({
    id: nonEmptyStringSchema,
    kind: z.literal("transcribe"),
    status: z.enum(["running", "completed", "failed"]),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
    completedAt: nonEmptyStringSchema.optional(),
    error: nonEmptyStringSchema.optional(),
    input: z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("manual_file"),
        transcriptPath: nonEmptyStringSchema,
      }),
      z.object({
        mode: z.literal("local_stt"),
        engine: z.enum(["whisper_cpp", "mlx_whisper"]),
        modelId: nonEmptyStringSchema.optional(),
        modelPath: nonEmptyStringSchema.optional(),
        language: nonEmptyStringSchema.optional(),
      }),
      z.object({
        mode: z.literal("api_stt"),
        provider: z.literal("openai"),
        model: z.literal("whisper-1"),
        language: nonEmptyStringSchema.optional(),
      }),
    ]),
    result: transcriptionSummarySchema.optional(),
  }),
  z.object({
    id: nonEmptyStringSchema,
    kind: z.literal("plan"),
    status: z.enum(["running", "completed", "failed"]),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
    completedAt: nonEmptyStringSchema.optional(),
    error: nonEmptyStringSchema.optional(),
    input: z.object({
      provider: z.enum(["codex", "openai"]),
      model: nonEmptyStringSchema,
      settings: z.object({
        clipCount: z.number().int().positive(),
        minClipDurationSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        maxClipDurationSeconds: z.union([z.literal(30), z.literal(60), z.literal(90)]),
        subtitleCandidateCount: z.number().int().positive(),
      }),
    }),
    planId: nonEmptyStringSchema.optional(),
    planFilePath: nonEmptyStringSchema.optional(),
  }),
]);

const planningSessionSchema: z.ZodType<PlanningSession> = z.object({
  sessionId: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
  rootPath: nonEmptyStringSchema,
  source: z.object({
    videoPath: nonEmptyStringSchema,
    channelName: nonEmptyStringSchema,
    originalTitle: nonEmptyStringSchema,
    channelImagePath: nonEmptyStringSchema.optional(),
  }),
  jobs: z.array(planningSessionJobSchema),
  latestTranscription: transcriptionSummarySchema.optional(),
  latestPlanId: nonEmptyStringSchema.optional(),
  latestPlanFilePath: nonEmptyStringSchema.optional(),
});

function sanitizeFolderName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "session";
}

function formatTimestamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

async function createUniquePlanningSessionDirectory(
  rootPath: string,
  originalTitle: string,
): Promise<string> {
  const baseName = `${sanitizeFolderName(originalTitle)}_${formatTimestamp(new Date())}`;

  let suffix = 0;

  while (true) {
    const candidate =
      suffix === 0
        ? join(rootPath, baseName)
        : join(rootPath, `${baseName}_${suffix + 1}`);

    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;

      if (code !== "EEXIST") {
        throw error;
      }

      suffix += 1;
    }
  }
}

export function getPlanningSessionsRootPath(rootDirectory?: string): string {
  return getPlanSnapshotsRootPath(rootDirectory);
}

export function getPlanningSessionDirectoryPath(
  sessionId: string,
  rootDirectory?: string,
): string {
  return join(getPlanningSessionsRootPath(rootDirectory), sessionId);
}

export function getPlanningSessionFilePath(
  sessionId: string,
  rootDirectory?: string,
): string {
  return join(getPlanningSessionDirectoryPath(sessionId, rootDirectory), "session.json");
}

export async function writePlanningSession(session: PlanningSession): Promise<void> {
  const sessionFilePath = join(session.rootPath, "session.json");
  const normalized: PlanningSession = {
    ...session,
    sessionId: basename(session.rootPath),
  };

  const tempPath = join(
    session.rootPath,
    `session.json.tmp-${crypto.randomUUID()}`,
  );
  await writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  await rename(tempPath, sessionFilePath);
}

export async function createPlanningSession(input: PlanningSessionSource & {
  rootDirectory?: string;
}): Promise<PlanningSession> {
  const rootPath = getPlanningSessionsRootPath(input.rootDirectory);
  await mkdir(rootPath, { recursive: true });
  const sessionDirectoryPath = await createUniquePlanningSessionDirectory(
    rootPath,
    input.originalTitle,
  );
  await mkdir(join(sessionDirectoryPath, "transcripts"), { recursive: true });
  await mkdir(join(sessionDirectoryPath, "plans"), { recursive: true });
  await mkdir(join(sessionDirectoryPath, "temp"), { recursive: true });

  const now = new Date().toISOString();
  const session: PlanningSession = {
    sessionId: basename(sessionDirectoryPath),
    createdAt: now,
    updatedAt: now,
    rootPath: sessionDirectoryPath,
    source: {
      videoPath: input.videoPath,
      channelName: input.channelName,
      originalTitle: input.originalTitle,
      ...(input.channelImagePath?.trim()
        ? { channelImagePath: input.channelImagePath.trim() }
        : {}),
    },
    jobs: [],
  };

  await writePlanningSession(session);
  return session;
}

export async function loadPlanningSession(
  sessionId: string,
  rootDirectory?: string,
): Promise<PlanningSession> {
  const sessionFilePath = getPlanningSessionFilePath(sessionId, rootDirectory);
  const raw = await readFile(sessionFilePath, "utf8");

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`planning session is not valid JSON: ${sessionFilePath}`);
  }

  const parsed = planningSessionSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid planning session");
  }

  return parsed.data;
}
