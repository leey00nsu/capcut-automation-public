import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractVideoPoster(input: {
  videoPath: string;
  timeSeconds: number;
}): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      input.timeSeconds.toFixed(3),
      "-i",
      input.videoPath,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ],
    {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return stdout;
}
