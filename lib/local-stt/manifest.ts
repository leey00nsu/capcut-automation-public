import {
  getLocalSttFfmpegCacheDirectoryPath,
  getLocalSttHuggingFaceCacheDirectoryPath,
  getLocalSttPythonDirectoryPath,
  getLocalSttRootPath,
  getLocalSttVenvDirectoryPath,
} from "@/lib/local-stt/paths";
import type {
  LocalSttComponentKey,
  LocalSttInstallPlanItem,
} from "@/types/local-stt";

const MIB = 1024 * 1024;

export const DEFAULT_LOCAL_STT_MODEL_ID = "mlx-community/whisper-medium";
export const DEFAULT_LOCAL_STT_MODEL_LABEL = "Balanced";

export function getLocalSttManifest(
  installRoot = getLocalSttRootPath(),
): LocalSttInstallPlanItem[] {
  const items: Array<
    Omit<LocalSttInstallPlanItem, "installPath"> & { key: LocalSttComponentKey }
  > = [
    {
      key: "python",
      title: "Managed Python runtime",
      version: "3.12",
      purpose: "MLX runtime base interpreter",
      sourceLabel: "Astral managed Python",
      downloadBytes: 68 * MIB,
      installBytes: 210 * MIB,
    },
    {
      key: "venv",
      title: "Managed Python virtual environment",
      version: "1",
      purpose: "Isolated package environment",
      sourceLabel: "capcut-automation",
      downloadBytes: 0,
      installBytes: 12 * MIB,
    },
    {
      key: "mlx_whisper",
      title: "MLX Whisper runtime package",
      version: "mlx-whisper",
      purpose: "Local Apple Silicon transcription engine",
      sourceLabel: "PyPI",
      downloadBytes: 32 * MIB,
      installBytes: 95 * MIB,
    },
    {
      key: "ffmpeg",
      title: "Managed FFmpeg binary",
      version: "imageio-ffmpeg",
      purpose: "Audio extraction for transcription",
      sourceLabel: "PyPI",
      downloadBytes: 30 * MIB,
      installBytes: 82 * MIB,
    },
    {
      key: "default_model",
      title: "Default STT model",
      version: DEFAULT_LOCAL_STT_MODEL_ID,
      purpose: "Balanced multilingual Whisper model",
      sourceLabel: "Hugging Face",
      downloadBytes: 1024 * MIB,
      installBytes: 1024 * MIB,
    },
  ];

  return items.map((item) => ({
    ...item,
    installPath: getInstallPathForComponent(item.key, installRoot),
  }));
}

export function getInstallPathForComponent(
  key: LocalSttComponentKey,
  installRoot = getLocalSttRootPath(),
): string {
  switch (key) {
    case "python":
      return getLocalSttPythonDirectoryPath(installRoot);
    case "venv":
    case "mlx_whisper":
      return getLocalSttVenvDirectoryPath(installRoot);
    case "ffmpeg":
      return getLocalSttFfmpegCacheDirectoryPath(installRoot);
    case "default_model":
      return getLocalSttHuggingFaceCacheDirectoryPath(installRoot);
  }
}
