import { access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { promisify } from "node:util";

import {
  DEFAULT_LOCAL_STT_MODEL_ID,
  DEFAULT_LOCAL_STT_MODEL_LABEL,
  getLocalSttManifest,
} from "@/lib/local-stt/manifest";
import {
  getLocalSttPythonDirectoryPath,
  getLocalSttPackageMarkerPath,
  getLocalSttRootPath,
  getLocalSttVenvPythonPath,
} from "@/lib/local-stt/paths";
import { readLocalSttLock } from "@/lib/local-stt/lock";
import { readLocalSttSetupState } from "@/lib/local-stt/store";
import type {
  LocalSttComponentState,
  LocalSttInstallPlan,
  LocalSttPlatform,
  LocalSttSetupState,
  LocalSttStatusResponse,
} from "@/types/local-stt";

const execFileAsync = promisify(execFile);
const SAFETY_MARGIN_BYTES = 256 * 1024 * 1024;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getFreeDiskBytes(targetPath: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync("df", ["-k", targetPath], {
      maxBuffer: 1024 * 1024,
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const row = lines.at(-1);

    if (!row) {
      return undefined;
    }

    const columns = row.split(/\s+/);
    const availableKilobytes = Number(columns[3]);

    return Number.isFinite(availableKilobytes)
      ? availableKilobytes * 1024
      : undefined;
  } catch {
    return undefined;
  }
}

async function isWritableDirectory(path: string): Promise<boolean> {
  try {
    await mkdir(path, { recursive: true });
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function canonicalizePlan(plan: Omit<LocalSttInstallPlan, "fingerprint">): string {
  return JSON.stringify({
    installRoot: plan.installRoot,
    modelId: plan.modelId,
    modelLabel: plan.modelLabel,
    requiresNetwork: plan.requiresNetwork,
    totalDownloadBytes: plan.totalDownloadBytes,
    totalInstallBytes: plan.totalInstallBytes,
    items: plan.items.map((item) => ({
      key: item.key,
      title: item.title,
      version: item.version,
      purpose: item.purpose,
      sourceLabel: item.sourceLabel,
      downloadBytes: item.downloadBytes,
      installBytes: item.installBytes,
      installPath: item.installPath,
    })),
  });
}

export function buildLocalSttInstallPlan(input: {
  installRoot?: string;
  freeDiskBytes: number;
  generatedAt?: string;
}): LocalSttInstallPlan {
  const installRoot = input.installRoot ?? getLocalSttRootPath();
  const items = getLocalSttManifest(installRoot);
  const planWithoutFingerprint = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    installRoot,
    modelId: DEFAULT_LOCAL_STT_MODEL_ID,
    modelLabel: DEFAULT_LOCAL_STT_MODEL_LABEL,
    requiresNetwork: true,
    totalDownloadBytes: items.reduce((total, item) => total + item.downloadBytes, 0),
    totalInstallBytes: items.reduce((total, item) => total + item.installBytes, 0),
    freeDiskBytes: input.freeDiskBytes,
    items,
  };

  return {
    ...planWithoutFingerprint,
    fingerprint: createHash("sha256")
      .update(canonicalizePlan(planWithoutFingerprint))
      .digest("hex"),
  };
}

async function probeComponents(installRoot: string): Promise<LocalSttComponentState[]> {
  const manifest = getLocalSttManifest(installRoot);

  return Promise.all(
    manifest.map(async (item) => {
      const installed = await (async () => {
        switch (item.key) {
          case "python":
            return pathExists(getLocalSttPythonDirectoryPath(installRoot));
          case "venv":
            return pathExists(getLocalSttVenvPythonPath(installRoot));
          case "mlx_whisper":
            return pathExists(getLocalSttPackageMarkerPath("mlx-whisper", installRoot));
          case "ffmpeg":
            return pathExists(getLocalSttPackageMarkerPath("ffmpeg", installRoot));
          case "default_model":
            return pathExists(getLocalSttPackageMarkerPath("default-model", installRoot));
        }
      })();

      return {
        ...item,
        installed,
        healthy: installed,
      };
    }),
  );
}

function resolvePlatform(
  platform?: Partial<LocalSttPlatform>,
): LocalSttPlatform & { supported: boolean } {
  const resolved = {
    os: platform?.os ?? process.platform,
    arch: platform?.arch ?? process.arch,
    ...(platform?.macosVersion ? { macosVersion: platform.macosVersion } : {}),
  };

  if (resolved.os !== "darwin") {
    return {
      ...resolved,
      supported: false,
      reason: "Local STT is only available on macOS.",
    };
  }

  if (resolved.arch !== "arm64") {
    return {
      ...resolved,
      supported: false,
      reason: "Local STT requires Apple Silicon.",
    };
  }

  return {
    ...resolved,
    supported: true,
  };
}

function resolveSetupStatus(input: {
  supported: boolean;
  components: LocalSttComponentState[];
  hasActiveOperation: boolean;
  hasStaleOperation: boolean;
  freeDiskBytes?: number;
  requiredInstallBytes: number;
}): LocalSttSetupState["status"] {
  if (!input.supported) {
    return "unsupported";
  }

  if (input.hasActiveOperation) {
    return "installing";
  }

  const healthyCount = input.components.filter(
    (component) => component.installed && component.healthy,
  ).length;

  if (healthyCount === input.components.length) {
    return "ready";
  }

  if (input.hasStaleOperation) {
    return "failed";
  }

  if (healthyCount > 0) {
    return "partial";
  }

  if (
    input.freeDiskBytes !== undefined &&
    input.freeDiskBytes < input.requiredInstallBytes + SAFETY_MARGIN_BYTES
  ) {
    return "failed";
  }

  return "not_installed";
}

export async function resolveLocalSttStatus(input?: {
  installRoot?: string;
  platform?: Partial<LocalSttPlatform>;
  generatedAt?: string;
}): Promise<LocalSttStatusResponse> {
  const installRoot = input?.installRoot ?? getLocalSttRootPath();
  const platform = resolvePlatform(input?.platform);
  const persistedState = await readLocalSttSetupState(installRoot);
  const activeOperation = platform.supported
    ? await readLocalSttLock(installRoot)
    : null;
  const hasStaleOperation = Boolean(
    persistedState?.currentOperation && !activeOperation,
  );
  const components = await probeComponents(installRoot);
  const freeDiskBytes = platform.supported
    ? await getFreeDiskBytes(dirname(installRoot))
    : undefined;
  const installPlan =
    platform.supported && freeDiskBytes !== undefined
      ? buildLocalSttInstallPlan({
          installRoot,
          freeDiskBytes,
          generatedAt: input?.generatedAt,
        })
      : undefined;
  const status = resolveSetupStatus({
    supported: platform.supported,
    components,
    hasActiveOperation: Boolean(activeOperation),
    hasStaleOperation,
    freeDiskBytes,
    requiredInstallBytes: installPlan?.totalInstallBytes ?? 0,
  });

  const writable = platform.supported
    ? await isWritableDirectory(installRoot)
    : false;
  const reason = !platform.supported
    ? platform.reason
    : !writable
      ? "Install root is not writable."
      : hasStaleOperation
        ? persistedState?.lastError ??
          "이전 로컬 전사 설치가 중단되었습니다. 수리를 다시 실행하세요."
      : persistedState?.lastError;

  return {
    setup: {
      status,
      supported: platform.supported && writable,
      platform: {
        os: platform.os,
        arch: platform.arch,
        ...(platform.macosVersion ? { macosVersion: platform.macosVersion } : {}),
        ...(reason ? { reason } : {}),
      },
      installRoot,
      ...(freeDiskBytes !== undefined ? { freeDiskBytes } : {}),
      selectedModelId: DEFAULT_LOCAL_STT_MODEL_ID,
      selectedModelLabel: DEFAULT_LOCAL_STT_MODEL_LABEL,
      components,
      ...(activeOperation
        ? { currentOperation: activeOperation }
        : {}),
      ...(persistedState?.lastCompletedAt
        ? { lastCompletedAt: persistedState.lastCompletedAt }
        : {}),
      ...(reason ? { lastError: reason } : {}),
    },
    ...(installPlan ? { installPlan } : {}),
  };
}
