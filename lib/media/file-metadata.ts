import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);

export type MediaFileMetadata = {
  width: number;
  height: number;
  hasAudio: boolean;
  durationUnits?: number;
};

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
};

type FfprobeResult = {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
  };
};

function parseDurationUnits(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  return Math.round(seconds * 1_000_000);
}

export async function getMediaFileMetadata(
  filePath: string,
): Promise<MediaFileMetadata> {
  const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,width,height",
    "-of",
    "json",
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as FfprobeResult;
  const streams = parsed.streams ?? [];
  const visualStream = streams.find(
    (stream) =>
      typeof stream.width === "number" && typeof stream.height === "number",
  );

  if (!visualStream?.width || !visualStream.height) {
    throw new Error(`Unable to determine media dimensions: ${filePath}`);
  }

  const durationUnits = parseDurationUnits(parsed.format?.duration);

  return {
    width: visualStream.width,
    height: visualStream.height,
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    ...(durationUnits ? { durationUnits } : {}),
  };
}
