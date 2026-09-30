import { execFile } from "node:child_process";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);

function buildSegmentCachePath(input: {
  videoPath: string;
  startSeconds: number;
  endSeconds: number;
}): string {
  const cacheKey = createHash("sha1")
    .update(
      `${input.videoPath}:${input.startSeconds.toFixed(3)}:${input.endSeconds.toFixed(3)}`,
    )
    .digest("hex");

  return join(tmpdir(), "capcut-automation-segments", `${cacheKey}.mp4`);
}

export async function getSegmentFilePath(input: {
  videoPath: string;
  startSeconds: number;
  endSeconds: number;
}): Promise<string> {
  const durationSeconds = input.endSeconds - input.startSeconds;

  if (!(durationSeconds > 0)) {
    throw new Error("segment duration must be greater than zero");
  }

  const outputPath = buildSegmentCachePath(input);

  await mkdir(join(tmpdir(), "capcut-automation-segments"), {
    recursive: true,
  });

  try {
    await access(outputPath);
    return outputPath;
  } catch {
    // segment cache miss
  }

  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp.mp4`;

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        input.startSeconds.toFixed(3),
        "-i",
        input.videoPath,
        "-t",
        durationSeconds.toFixed(3),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "22",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        tempPath,
      ],
      {
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    try {
      await rename(tempPath, outputPath);
    } catch (error) {
      await rm(tempPath, { force: true });

      if (error instanceof Error) {
        // Another request may have already produced the file.
        await access(outputPath);
      } else {
        throw error;
      }
    }
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  return outputPath;
}
