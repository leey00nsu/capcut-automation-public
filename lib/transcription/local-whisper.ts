import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildTimestampedTranscriptText } from "@/lib/transcription/format";
import type { TranscriptionResult } from "@/lib/transcription/types";
import type { TranscriptSegment } from "@/types/session";

const execFileAsync = promisify(execFile);
const WHISPER_SEGMENT_PATTERN =
  /^\[(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(.*)$/;

function resolveWhisperCommand(): string {
  return process.env.WHISPER_CPP_COMMAND?.trim() || "whisper-cli";
}

function resolveWhisperModelPath(modelPath?: string): string {
  const resolved = modelPath?.trim() || process.env.WHISPER_CPP_MODEL_PATH?.trim();

  if (!resolved) {
    throw new Error(
      "Local transcription requires a Whisper model path or WHISPER_CPP_MODEL_PATH",
    );
  }

  return resolved;
}

export function parseWhisperSegments(output: string): TranscriptSegment[] {
  const segments = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reduce<TranscriptSegment[]>((accumulator, line) => {
      const match = WHISPER_SEGMENT_PATTERN.exec(line);

      if (!match) {
        return accumulator;
      }

      const [, start, end, text] = match;

      if (!text.trim()) {
        return accumulator;
      }

      accumulator.push({
        id: `seg-${String(accumulator.length + 1).padStart(3, "0")}`,
        start,
        end,
        text: text.trim(),
      });

      return accumulator;
    }, []);

  if (segments.length === 0) {
    throw new Error("Local transcription did not return timestamped segments");
  }

  return segments;
}

export async function transcribeWithLocalWhisper(input: {
  audioPath: string;
  modelPath?: string;
  language?: string;
}): Promise<TranscriptionResult> {
  const modelPath = resolveWhisperModelPath(input.modelPath);
  const command = resolveWhisperCommand();
  const args = ["-m", modelPath, "-f", input.audioPath];

  if (input.language?.trim()) {
    args.push("-l", input.language.trim());
  }

  const { stdout, stderr } = await execFileAsync(command, args, {
    maxBuffer: 20 * 1024 * 1024,
  });
  const segments = parseWhisperSegments([stdout, stderr].filter(Boolean).join("\n"));

  return {
    transcriptText: buildTimestampedTranscriptText(segments),
    segments,
    summary: {
      mode: "local_stt",
      engine: "whisper_cpp",
      model: modelPath,
      ...(input.language?.trim() ? { language: input.language.trim() } : {}),
    },
  };
}
