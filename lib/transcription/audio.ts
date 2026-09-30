import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractTranscriptionAudio(input: {
  videoPath: string;
  outputPath: string;
}): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input.videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      input.outputPath,
    ],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}
