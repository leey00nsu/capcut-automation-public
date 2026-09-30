import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { z } from "zod";

import { getLocalSttSetupPath } from "@/lib/local-stt/paths";
import type { LocalSttSetupState } from "@/types/local-stt";

const localSttComponentStateSchema = z.object({
  key: z.enum(["python", "venv", "mlx_whisper", "ffmpeg", "default_model"]),
  title: z.string().trim().min(1),
  version: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  installed: z.boolean(),
  healthy: z.boolean(),
  downloadBytes: z.number().nonnegative(),
  installBytes: z.number().nonnegative(),
  installPath: z.string().trim().min(1),
  sourceLabel: z.string().trim().min(1),
});

const localSttSetupStateSchema: z.ZodType<LocalSttSetupState> = z.object({
  status: z.enum([
    "unsupported",
    "not_installed",
    "partial",
    "installing",
    "ready",
    "failed",
  ]),
  supported: z.boolean(),
  platform: z.object({
    os: z.string().trim().min(1),
    arch: z.string().trim().min(1),
    macosVersion: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  }),
  installRoot: z.string().trim().min(1),
  freeDiskBytes: z.number().nonnegative().optional(),
  selectedModelId: z.string().trim().min(1),
  selectedModelLabel: z.string().trim().min(1),
  components: z.array(localSttComponentStateSchema),
  currentOperation: z
    .object({
      kind: z.enum(["install", "repair", "uninstall"]),
      startedAt: z.string().trim().min(1),
      stepKey: z.string().trim().min(1),
    })
    .optional(),
  lastCompletedAt: z.string().trim().min(1).optional(),
  lastError: z.string().trim().min(1).optional(),
});

export async function readLocalSttSetupState(
  rootPath?: string,
): Promise<LocalSttSetupState | null> {
  const setupPath = getLocalSttSetupPath(rootPath);

  try {
    const raw = await readFile(setupPath, "utf8");
    return localSttSetupStateSchema.parse(JSON.parse(raw));
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeLocalSttSetupState(
  state: LocalSttSetupState,
  rootPath?: string,
): Promise<void> {
  const setupPath = getLocalSttSetupPath(rootPath ?? state.installRoot);
  await mkdir(state.installRoot, { recursive: true });
  await writeFile(setupPath, JSON.stringify(state, null, 2), "utf8");
}

export async function clearLocalSttSetupState(rootPath?: string): Promise<void> {
  const setupPath = getLocalSttSetupPath(rootPath);
  await rm(setupPath, { force: true });
}
