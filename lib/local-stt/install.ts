import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  DEFAULT_LOCAL_STT_MODEL_ID,
  DEFAULT_LOCAL_STT_MODEL_LABEL,
} from "@/lib/local-stt/manifest";
import { withLocalSttLock } from "@/lib/local-stt/lock";
import {
  getLocalSttCacheDirectoryPath,
  getLocalSttFfmpegCacheDirectoryPath,
  getLocalSttHuggingFaceCacheDirectoryPath,
  getLocalSttInstallLogPath,
  getLocalSttMarkersDirectoryPath,
  getLocalSttPackageMarkerPath,
  getLocalSttPythonDirectoryPath,
  getLocalSttRootPath,
  getLocalSttScriptsDirectoryPath,
  getLocalSttUvDirectoryPath,
  getLocalSttUvExecutablePath,
  getLocalSttVenvDirectoryPath,
  getLocalSttVenvPythonPath,
} from "@/lib/local-stt/paths";
import { resolveLocalSttStatus } from "@/lib/local-stt/status";
import { clearLocalSttSetupState, writeLocalSttSetupState } from "@/lib/local-stt/store";
import type { LocalSttStatusResponse } from "@/types/local-stt";

const execFileAsync = promisify(execFile);
const UV_INSTALL_URL = "https://astral.sh/uv/install.sh";
const PYTHON_VERSION = "3.12";

type ProcessResult = {
  stdout: string;
  stderr: string;
};

type ProcessRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => Promise<ProcessResult>;

type InstallDependencies = {
  installViaUv?: typeof installViaUv;
  resolveStatus?: typeof resolveLocalSttStatus;
  processRunner?: ProcessRunner;
  fetcher?: typeof fetch;
  now?: () => string;
};

export class LocalSttConflictError extends Error {
  constructor(message = "Local STT install plan changed.") {
    super(message);
    this.name = "LocalSttConflictError";
  }
}

export class LocalSttValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalSttValidationError";
  }
}

async function defaultProcessRunner(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProcessResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options?.cwd,
    env: options?.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  return { stdout, stderr };
}

function buildManagedEnv(installRoot: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: getLocalSttPythonDirectoryPath(installRoot),
    UV_CACHE_DIR: join(getLocalSttCacheDirectoryPath(installRoot), "uv"),
    HF_HOME: getLocalSttHuggingFaceCacheDirectoryPath(installRoot),
    HF_HUB_DISABLE_PROGRESS_BARS: "1",
  };
}

async function writeMarker(
  key: "mlx-whisper" | "ffmpeg" | "default-model",
  payload: Record<string, unknown>,
  installRoot: string,
): Promise<void> {
  await mkdir(getLocalSttMarkersDirectoryPath(installRoot), { recursive: true });
  await writeFile(
    getLocalSttPackageMarkerPath(key, installRoot),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

async function ensureUvInstalled(input: {
  installRoot: string;
  processRunner: ProcessRunner;
  fetcher: typeof fetch;
}): Promise<void> {
  const uvExecutablePath = getLocalSttUvExecutablePath(input.installRoot);

  try {
    await execFileAsync("test", ["-x", uvExecutablePath]);
    return;
  } catch {
    // Fall through to managed install.
  }

  const response = await input.fetcher(UV_INSTALL_URL);

  if (!response.ok) {
    throw new Error(`Failed to download uv installer: ${response.status}`);
  }

  const scriptPath = join(getLocalSttUvDirectoryPath(input.installRoot), "install.sh");
  await mkdir(getLocalSttUvDirectoryPath(input.installRoot), { recursive: true });
  await writeFile(scriptPath, await response.text(), "utf8");
  await input.processRunner(
    "sh",
    [scriptPath],
    {
      env: {
        ...process.env,
        UV_UNMANAGED_INSTALL: getLocalSttUvDirectoryPath(input.installRoot),
      },
    },
  );
}

async function installViaUv(input: {
  installRoot: string;
  processRunner?: ProcessRunner;
  fetcher?: typeof fetch;
  onProgress?: (stepKey: string) => Promise<void>;
}): Promise<void> {
  const processRunner = input.processRunner ?? defaultProcessRunner;
  const fetcher = input.fetcher ?? fetch;
  const installRoot = input.installRoot;
  const managedEnv = buildManagedEnv(installRoot);
  const uvExecutablePath = getLocalSttUvExecutablePath(installRoot);
  const venvDirectoryPath = getLocalSttVenvDirectoryPath(installRoot);
  const venvPythonPath = getLocalSttVenvPythonPath(installRoot);

  await mkdir(getLocalSttFfmpegCacheDirectoryPath(installRoot), { recursive: true });
  await mkdir(getLocalSttHuggingFaceCacheDirectoryPath(installRoot), { recursive: true });
  await mkdir(getLocalSttScriptsDirectoryPath(installRoot), { recursive: true });
  await input.onProgress?.("install_uv");
  await ensureUvInstalled({
    installRoot,
    processRunner,
    fetcher,
  });

  await input.onProgress?.("create_venv");
  await processRunner(
    uvExecutablePath,
    ["venv", "--python", PYTHON_VERSION, venvDirectoryPath],
    { env: managedEnv },
  );
  await input.onProgress?.("install_packages");
  await processRunner(
    uvExecutablePath,
    [
      "pip",
      "install",
      "--python",
      venvPythonPath,
      "mlx-whisper",
      "imageio-ffmpeg",
      "huggingface-hub",
    ],
    { env: managedEnv },
  );
  await writeMarker(
    "mlx-whisper",
    {
      package: "mlx-whisper",
      installedAt: new Date().toISOString(),
      installRoot,
    },
    installRoot,
  );

  await input.onProgress?.("prepare_ffmpeg");
  const ffmpegResult = await processRunner(
    venvPythonPath,
    [
      "-c",
      [
        "import imageio_ffmpeg",
        "import json",
        "print(json.dumps({'path': imageio_ffmpeg.get_ffmpeg_exe()}))",
      ].join("; "),
    ],
    { env: managedEnv },
  );
  await writeMarker(
    "ffmpeg",
    {
      package: "imageio-ffmpeg",
      installedAt: new Date().toISOString(),
      ...JSON.parse(ffmpegResult.stdout.trim() || "{}"),
    },
    installRoot,
  );

  await input.onProgress?.("download_model");
  const modelResult = await processRunner(
    venvPythonPath,
    [
      "-c",
      [
        "from huggingface_hub import snapshot_download",
        "import json",
        `path = snapshot_download(repo_id='${DEFAULT_LOCAL_STT_MODEL_ID}')`,
        "print(json.dumps({'path': path}))",
      ].join("; "),
    ],
    { env: managedEnv },
  );
  await writeMarker(
    "default-model",
    {
      modelId: DEFAULT_LOCAL_STT_MODEL_ID,
      modelLabel: DEFAULT_LOCAL_STT_MODEL_LABEL,
      installedAt: new Date().toISOString(),
      ...JSON.parse(modelResult.stdout.trim() || "{}"),
    },
    installRoot,
  );
}

async function writeSetupSnapshot(
  status: LocalSttStatusResponse,
  installRoot: string,
  input?: {
    currentOperation?: {
      kind: "install" | "repair" | "uninstall";
      startedAt: string;
      stepKey: string;
    };
    lastError?: string;
    lastCompletedAt?: string;
  },
): Promise<void> {
  const nextSetup = {
    ...status.setup,
    installRoot,
    ...(input?.lastCompletedAt ? { lastCompletedAt: input.lastCompletedAt } : {}),
    ...(input?.lastError ? { lastError: input.lastError } : {}),
  };

  await writeLocalSttSetupState({
    ...nextSetup,
    ...(input?.currentOperation ? { currentOperation: input.currentOperation } : {}),
  });
}

export async function installLocalStt(
  input: {
    acceptedPlanFingerprint: string;
    installRoot?: string;
  },
  dependencies: InstallDependencies = {},
): Promise<LocalSttStatusResponse> {
  const installRoot = input.installRoot ?? getLocalSttRootPath();
  const resolveStatus = dependencies.resolveStatus ?? resolveLocalSttStatus;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const status = await resolveStatus({ installRoot });

  if (!status.setup.supported) {
    throw new LocalSttValidationError(
      status.setup.platform.reason ?? "Local STT is not supported on this machine.",
    );
  }

  if (!status.installPlan) {
    throw new LocalSttValidationError("Local STT install plan is unavailable.");
  }

  if (status.installPlan.fingerprint !== input.acceptedPlanFingerprint) {
    throw new LocalSttConflictError();
  }

  if (status.setup.status === "ready") {
    return status;
  }

  const startedAt = now();
  const updateInstallStep = async (stepKey: string) => {
    await writeSetupSnapshot(status, installRoot, {
      currentOperation: {
        kind: "install",
        startedAt,
        stepKey,
      },
    });
  };

  try {
    await withLocalSttLock({
      installRoot,
      operation: {
        kind: "install",
        startedAt,
        stepKey: "bootstrap",
      },
      run: async () => {
        await updateInstallStep("bootstrap");
        await (dependencies.installViaUv ?? installViaUv)({
          installRoot,
          processRunner: dependencies.processRunner,
          fetcher: dependencies.fetcher,
          onProgress: updateInstallStep,
        });
      },
    });
  } catch (error) {
    const failedStatus = await resolveStatus({ installRoot });
    await writeLocalSttSetupState({
      ...failedStatus.setup,
      status: "failed",
      installRoot,
      lastError:
        error instanceof Error ? error.message : "Local STT install failed.",
    });
    throw error;
  }

  const readyStatus = await resolveStatus({ installRoot });
  const normalizedReadyStatus: LocalSttStatusResponse = {
    ...readyStatus,
    setup: {
      ...readyStatus.setup,
      status: "ready",
    },
  };
  await writeSetupSnapshot(normalizedReadyStatus, installRoot, {
    lastCompletedAt: now(),
  });

  return normalizedReadyStatus;
}

export async function repairLocalStt(
  input?: {
    installRoot?: string;
  },
  dependencies: InstallDependencies = {},
): Promise<LocalSttStatusResponse> {
  const installRoot = input?.installRoot ?? getLocalSttRootPath();
  const resolveStatus = dependencies.resolveStatus ?? resolveLocalSttStatus;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const status = await resolveStatus({ installRoot });

  if (!status.setup.supported) {
    throw new LocalSttValidationError(
      status.setup.platform.reason ?? "Local STT is not supported on this machine.",
    );
  }

  const startedAt = now();
  const updateRepairStep = async (stepKey: string) => {
    await writeSetupSnapshot(status, installRoot, {
      currentOperation: {
        kind: "repair",
        startedAt,
        stepKey,
      },
    });
  };

  try {
    await withLocalSttLock({
      installRoot,
      operation: {
        kind: "repair",
        startedAt,
        stepKey: "repair",
      },
      run: async () => {
        await updateRepairStep("repair");
        await (dependencies.installViaUv ?? installViaUv)({
          installRoot,
          processRunner: dependencies.processRunner,
          fetcher: dependencies.fetcher,
          onProgress: updateRepairStep,
        });
      },
    });
  } catch (error) {
    const failedStatus = await resolveStatus({ installRoot });
    await writeLocalSttSetupState({
      ...failedStatus.setup,
      status: "failed",
      installRoot,
      lastError:
        error instanceof Error ? error.message : "Local STT repair failed.",
    });
    throw error;
  }

  const readyStatus = await resolveStatus({ installRoot });
  const normalizedReadyStatus: LocalSttStatusResponse = {
    ...readyStatus,
    setup: {
      ...readyStatus.setup,
      status: "ready",
    },
  };
  await writeSetupSnapshot(normalizedReadyStatus, installRoot, {
    lastCompletedAt: now(),
  });

  return normalizedReadyStatus;
}

export async function uninstallLocalStt(input?: {
  installRoot?: string;
}): Promise<LocalSttStatusResponse> {
  const installRoot = input?.installRoot ?? getLocalSttRootPath();

  await withLocalSttLock({
    installRoot,
    operation: {
      kind: "uninstall",
      startedAt: new Date().toISOString(),
      stepKey: "cleanup",
    },
    run: async () => {
      await rm(installRoot, { recursive: true, force: true });
    },
  });

  await clearLocalSttSetupState(installRoot);
  return resolveLocalSttStatus({ installRoot });
}

export { installViaUv };
