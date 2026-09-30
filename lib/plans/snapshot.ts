import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createPlannerOutputSchema } from "@/lib/ai/schema";
import {
  ensureReadableFilePath,
} from "@/lib/files/paths";
import { plannerSettingsSchema } from "@/lib/planner/settings";
import type {
  ImportedPlanResponse,
  PlanUsage,
  PlanResponse,
  PlanSnapshotFile,
  PlanSnapshotMetadata,
  RecentPlanEntry,
  PlannerModel,
  PlannerProvider,
  PlannerSource,
} from "@/types/planner";
import type { TranscriptionSummary } from "@/types/session";

const nonEmptyStringSchema = z.string().trim().min(1);

const planSnapshotMetadataSchema: z.ZodType<PlanSnapshotMetadata> = z.object({
  outputRootPath: nonEmptyStringSchema,
  sessionDirectoryPath: nonEmptyStringSchema,
  planFilePath: nonEmptyStringSchema,
});

const plannerSourceSchema: z.ZodType<PlannerSource> = z.object({
  videoPath: nonEmptyStringSchema,
  transcriptPath: nonEmptyStringSchema,
  channelName: nonEmptyStringSchema,
  originalTitle: nonEmptyStringSchema,
});

const planUsageSchema: z.ZodType<PlanUsage> = z.object({
  provider: z.enum(["codex", "openai"]),
  model: nonEmptyStringSchema,
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  pricingReference: nonEmptyStringSchema,
  costMode: z.enum(["actual_usage", "rough_estimate"]),
  note: nonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  reasoningEffort: nonEmptyStringSchema.optional(),
  threadId: nonEmptyStringSchema.optional(),
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
  segments: z
    .array(
      z.object({
        id: nonEmptyStringSchema,
        start: nonEmptyStringSchema,
        end: nonEmptyStringSchema,
        text: nonEmptyStringSchema,
        speaker: nonEmptyStringSchema.optional(),
      }),
    )
    .optional(),
});

const planResponseBaseSchema = z.object({
  planId: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema.optional(),
  source: plannerSourceSchema,
  settings: plannerSettingsSchema,
  snapshot: planSnapshotMetadataSchema,
  transcription: transcriptionSummarySchema.optional(),
  usage: planUsageSchema.optional(),
  clips: z.array(z.unknown()),
});

const planSnapshotFileBaseSchema = z.object({
  savedAt: nonEmptyStringSchema,
  provider: z.enum(["codex", "openai"]),
  model: nonEmptyStringSchema,
  channelImagePath: nonEmptyStringSchema.optional(),
  outputRootPath: nonEmptyStringSchema,
  sessionDirectoryPath: nonEmptyStringSchema,
  plan: planResponseBaseSchema,
});

function sanitizeFolderName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "plan";
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

export function getPlanSnapshotsRootPath(
  rootDirectory?: string,
): string {
  const dataRoot =
    rootDirectory ?? process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd();

  return join(dataRoot, "runs", "plans");
}

async function createUniqueSessionDirectory(
  outputRootPath: string,
  originalTitle: string,
): Promise<string> {
  const baseName = `${sanitizeFolderName(originalTitle)}_${formatTimestamp(new Date())}`;

  let suffix = 0;

  while (true) {
    const candidate =
      suffix === 0
        ? join(outputRootPath, baseName)
        : join(outputRootPath, `${baseName}_${suffix + 1}`);

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

export async function savePlanSnapshot(input: {
  provider: PlannerProvider;
  model: PlannerModel;
  channelImagePath?: string;
  plan: Omit<PlanResponse, "snapshot">;
  rootDirectory?: string;
}): Promise<PlanSnapshotFile> {
  const outputRootPath = getPlanSnapshotsRootPath(input.rootDirectory);
  await mkdir(outputRootPath, { recursive: true });
  const sessionDirectoryPath = await createUniqueSessionDirectory(
    outputRootPath,
    input.plan.source.originalTitle,
  );
  const planFilePath = join(sessionDirectoryPath, "plan.json");

  const plan: PlanResponse = {
    ...input.plan,
    snapshot: {
      outputRootPath,
      sessionDirectoryPath,
      planFilePath,
    },
  };

  const snapshotFile: PlanSnapshotFile = {
    savedAt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    ...(input.channelImagePath?.trim()
      ? { channelImagePath: input.channelImagePath.trim() }
      : {}),
    outputRootPath,
    sessionDirectoryPath,
    plan,
  };

  const tempPath = join(
    sessionDirectoryPath,
    `plan.json.tmp-${crypto.randomUUID()}`,
  );
  await writeFile(tempPath, JSON.stringify(snapshotFile, null, 2), "utf8");
  await rename(tempPath, planFilePath);

  return snapshotFile;
}

export async function savePlanSnapshotForSession(input: {
  provider: PlannerProvider;
  model: PlannerModel;
  sessionId: string;
  sessionDirectoryPath: string;
  channelImagePath?: string;
  plan: Omit<PlanResponse, "snapshot">;
}): Promise<PlanSnapshotFile> {
  const outputRootPath = getPlanSnapshotsRootPath();
  const plansDirectoryPath = join(input.sessionDirectoryPath, "plans");
  await mkdir(plansDirectoryPath, { recursive: true });
  const planFilePath = join(plansDirectoryPath, "plan.json");

  const plan: PlanResponse = {
    ...input.plan,
    sessionId: input.sessionId,
    snapshot: {
      outputRootPath,
      sessionDirectoryPath: input.sessionDirectoryPath,
      planFilePath,
    },
  };

  const snapshotFile: PlanSnapshotFile = {
    savedAt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    ...(input.channelImagePath?.trim()
      ? { channelImagePath: input.channelImagePath.trim() }
      : {}),
    outputRootPath,
    sessionDirectoryPath: input.sessionDirectoryPath,
    plan,
  };

  const tempPath = join(
    plansDirectoryPath,
    `plan.json.tmp-${crypto.randomUUID()}`,
  );
  await writeFile(tempPath, JSON.stringify(snapshotFile, null, 2), "utf8");
  await rename(tempPath, planFilePath);

  return snapshotFile;
}

export async function loadPlanSnapshot(
  planFilePathInput: string,
): Promise<ImportedPlanResponse> {
  const planFilePath = await ensureReadableFilePath(planFilePathInput, "plan file path");
  const { snapshot, source, clips } = await readValidatedPlanSnapshot(planFilePath);

  return {
    planId: snapshot.plan.planId,
    ...(snapshot.plan.sessionId?.trim()
      ? { sessionId: snapshot.plan.sessionId.trim() }
      : {}),
    source,
    settings: snapshot.plan.settings,
    snapshot: snapshot.plan.snapshot,
    ...(snapshot.plan.transcription
      ? { transcription: snapshot.plan.transcription }
      : {}),
    ...(snapshot.plan.usage ? { usage: snapshot.plan.usage } : {}),
    clips,
    importMetadata: {
      provider: snapshot.provider,
      model: snapshot.model,
      ...(snapshot.channelImagePath?.trim()
        ? { channelImagePath: snapshot.channelImagePath.trim() }
        : {}),
    },
  };
}

async function readValidatedPlanSnapshot(planFilePath: string) {
  const raw = await readFile(planFilePath, "utf8");

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`plan file path is not valid JSON: ${planFilePath}`);
  }

  const parsed = planSnapshotFileBaseSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid plan snapshot");
  }

  const snapshot = parsed.data;
  const validatedPlannerOutput = createPlannerOutputSchema(
    snapshot.plan.settings,
  ).safeParse({
    source: snapshot.plan.source,
    clips: snapshot.plan.clips,
  });

  if (!validatedPlannerOutput.success) {
    throw new Error(
      validatedPlannerOutput.error.issues[0]?.message ?? "Invalid plan snapshot",
    );
  }

  return {
    snapshot,
    source: validatedPlannerOutput.data.source,
    clips: validatedPlannerOutput.data.clips,
  };
}

function normalizeRecentPlansLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return 8;
  }

  return Math.max(0, Math.min(Math.trunc(limit ?? 8), 20));
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function loadRecentPlanCandidate(
  planFilePath: string,
): Promise<RecentPlanEntry | null> {
  try {
    const { snapshot, source, clips } = await readValidatedPlanSnapshot(planFilePath);

    return {
      savedAt: snapshot.savedAt,
      planFilePath,
      sessionDirectoryPath: snapshot.sessionDirectoryPath,
      planId: snapshot.plan.planId,
      ...(snapshot.plan.sessionId?.trim()
        ? { sessionId: snapshot.plan.sessionId.trim() }
        : {}),
      originalTitle: source.originalTitle,
      channelName: source.channelName,
      videoPath: source.videoPath,
      clipCount: clips.length,
      provider: snapshot.provider,
      model: snapshot.model,
      ...(snapshot.plan.transcription?.mode
        ? { transcriptionMode: snapshot.plan.transcription.mode }
        : {}),
    };
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return null;
    }

    return null;
  }
}

export async function listRecentPlanSnapshots(input: {
  rootDirectory?: string;
  limit?: number;
} = {}): Promise<RecentPlanEntry[]> {
  const outputRootPath = getPlanSnapshotsRootPath(input.rootDirectory);
  const limit = normalizeRecentPlansLimit(input.limit);

  if (limit === 0) {
    return [];
  }

  let sessionEntries: Array<{ isDirectory: () => boolean; name: string }>;

  try {
    sessionEntries = await readdir(outputRootPath, { withFileTypes: true });
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return [];
    }

    throw error;
  }

  const candidatePaths = sessionEntries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const sessionDirectoryPath = join(outputRootPath, entry.name);

      return [
        join(sessionDirectoryPath, "plans", "plan.json"),
        join(sessionDirectoryPath, "plan.json"),
      ];
    });

  const recentPlans = (
    await Promise.all(candidatePaths.map((path) => loadRecentPlanCandidate(path)))
  ).filter((entry): entry is RecentPlanEntry => entry !== null);

  return recentPlans
    .sort((left, right) => {
      const savedAtDifference =
        Date.parse(right.savedAt) - Date.parse(left.savedAt);

      if (savedAtDifference !== 0) {
        return savedAtDifference;
      }

      return left.planFilePath.localeCompare(right.planFilePath);
    })
    .slice(0, limit);
}
