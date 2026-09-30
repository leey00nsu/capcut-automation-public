import { execFile } from "node:child_process";

export type PickPathMode = "file" | "directory";

type ExecFileAsync = (command: string, args: string[]) => Promise<string>;

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function buildAppleScript(mode: PickPathMode): string {
  if (mode === "directory") {
    return 'POSIX path of (choose folder with prompt "폴더를 선택하세요")';
  }

  return 'POSIX path of (choose file with prompt "파일을 선택하세요")';
}

function isUserCanceled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("User canceled") ||
      error.message.includes("(-128)") ||
      error.message.includes("execution error: User canceled"))
  );
}

export async function pickPath(
  mode: PickPathMode,
  execRunner: ExecFileAsync = execFileAsync,
): Promise<string | null> {
  try {
    const stdout = await execRunner("osascript", ["-e", buildAppleScript(mode)]);
    const path = stdout.trim();

    return path.length > 0 ? path : null;
  } catch (error) {
    if (isUserCanceled(error)) {
      return null;
    }

    throw error;
  }
}
