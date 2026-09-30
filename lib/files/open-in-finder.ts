import * as childProcess from "node:child_process";
import { stat } from "node:fs/promises";

type ExecFileAsync = (command: string, args: string[]) => Promise<void>;

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function openInFinder(
  path: string,
  execFileRunner: ExecFileAsync = execFileAsync,
): Promise<void> {
  const pathStat = await stat(path);

  if (pathStat.isDirectory()) {
    await execFileRunner("open", [path]);
    return;
  }

  if (pathStat.isFile()) {
    await execFileRunner("open", ["-R", path]);
    return;
  }

  throw new Error(`Path is not a file or directory: ${path}`);
}
