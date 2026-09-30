import { homedir } from "node:os";
import { join } from "node:path";

export function getLocalSttRootPath(homeDirectory = homedir()): string {
  return join(
    homeDirectory,
    "Library",
    "Application Support",
    "capcut-automation",
    "local-stt",
  );
}

export function getLocalSttSetupPath(rootPath = getLocalSttRootPath()): string {
  return join(rootPath, "setup.json");
}

export function getLocalSttLockPath(rootPath = getLocalSttRootPath()): string {
  return join(rootPath, "setup.lock");
}

export function getLocalSttLogsDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(rootPath, "logs");
}

export function getLocalSttInstallLogPath(rootPath = getLocalSttRootPath()): string {
  return join(getLocalSttLogsDirectoryPath(rootPath), "install.log");
}

export function getLocalSttTranscribeLogPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttLogsDirectoryPath(rootPath), "transcribe.log");
}

export function getLocalSttRuntimeDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(rootPath, "runtime");
}

export function getLocalSttUvDirectoryPath(rootPath = getLocalSttRootPath()): string {
  return join(getLocalSttRuntimeDirectoryPath(rootPath), "uv");
}

export function getLocalSttUvExecutablePath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttUvDirectoryPath(rootPath), "uv");
}

export function getLocalSttPythonDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttRuntimeDirectoryPath(rootPath), "python");
}

export function getLocalSttVenvDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttRuntimeDirectoryPath(rootPath), "venv");
}

export function getLocalSttVenvPythonPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttVenvDirectoryPath(rootPath), "bin", "python");
}

export function getLocalSttCacheDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(rootPath, "cache");
}

export function getLocalSttHuggingFaceCacheDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttCacheDirectoryPath(rootPath), "huggingface");
}

export function getLocalSttFfmpegCacheDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttCacheDirectoryPath(rootPath), "ffmpeg");
}

export function getLocalSttScriptsDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(rootPath, "scripts");
}

export function getManagedMlxHelperScriptPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttScriptsDirectoryPath(rootPath), "mlx_transcribe.py");
}

export function getLocalSttMarkersDirectoryPath(
  rootPath = getLocalSttRootPath(),
): string {
  return join(rootPath, ".markers");
}

export function getLocalSttPackageMarkerPath(
  packageName: "mlx-whisper" | "ffmpeg" | "default-model",
  rootPath = getLocalSttRootPath(),
): string {
  return join(getLocalSttMarkersDirectoryPath(rootPath), `${packageName}.json`);
}
