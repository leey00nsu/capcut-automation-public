import { execFile } from "node:child_process";
import { join } from "node:path";

import { DEFAULT_LOCAL_STT_MODEL_ID } from "@/lib/local-stt/manifest";
import {
  getLocalSttHuggingFaceCacheDirectoryPath,
  getLocalSttRootPath,
  getLocalSttVenvPythonPath,
} from "@/lib/local-stt/paths";
import { resolveLocalSttStatus } from "@/lib/local-stt/status";
import {
  buildTimestampedTranscriptText,
  secondsToTimecode,
} from "@/lib/transcription/format";
import type { TranscriptionResult } from "@/lib/transcription/types";
import type { TranscriptSegment } from "@/types/session";

function execFileAsync(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env,
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          stdout,
          stderr,
        });
      },
    );
  });
}

type ManagedMlxHelperSegment = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

type ManagedMlxHelperResponse = {
  segments: ManagedMlxHelperSegment[];
};

type ProcessRunner = (
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<{ stdout: string; stderr: string }>;

function getHelperScriptPath(): string {
  return join(process.cwd(), "scripts", "local-stt", "mlx_transcribe.py");
}

function normalizeSegments(segments: ManagedMlxHelperSegment[]): TranscriptSegment[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: `seg-${String(index + 1).padStart(3, "0")}`,
      start: secondsToTimecode(segment.startSeconds),
      end: secondsToTimecode(segment.endSeconds),
      text: segment.text.trim(),
    }));
}

export async function transcribeWithManagedMlx(input: {
  videoPath: string;
  modelId?: string;
  language?: string;
  installRoot?: string;
}, dependencies?: {
  processRunner?: ProcessRunner;
}): Promise<TranscriptionResult> {
  const installRoot = input.installRoot ?? getLocalSttRootPath();
  const status = await resolveLocalSttStatus({ installRoot });

  if (status.setup.status !== "ready") {
    throw new Error("Managed local STT is not ready.");
  }

  const modelId = input.modelId?.trim() || DEFAULT_LOCAL_STT_MODEL_ID;
  const pythonPath = getLocalSttVenvPythonPath(installRoot);
  const args = [getHelperScriptPath(), "--video-path", input.videoPath, "--model-id", modelId];

  if (input.language?.trim()) {
    args.push("--language", input.language.trim());
  }

  const { stdout } = await (dependencies?.processRunner ?? execFileAsync)(pythonPath, args, {
    ...process.env,
    HF_HOME: getLocalSttHuggingFaceCacheDirectoryPath(installRoot),
    PYTHONUTF8: "1",
  });

  const parsed = JSON.parse(stdout) as ManagedMlxHelperResponse;
  const segments = normalizeSegments(parsed.segments);

  if (segments.length === 0) {
    throw new Error("Managed local STT did not return any segments.");
  }

  return {
    transcriptText: buildTimestampedTranscriptText(segments),
    segments,
    summary: {
      mode: "local_stt",
      engine: "mlx_whisper",
      model: modelId,
      ...(input.language?.trim() ? { language: input.language.trim() } : {}),
    },
  };
}
