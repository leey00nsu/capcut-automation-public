import { mkdir, open, readFile, rm } from "node:fs/promises";

import { getLocalSttLockPath } from "@/lib/local-stt/paths";
import type { LocalSttCurrentOperation } from "@/types/local-stt";

export class LocalSttBusyError extends Error {
  constructor(message = "Local STT is busy.") {
    super(message);
    this.name = "LocalSttBusyError";
  }
}

export async function readLocalSttLock(
  installRoot?: string,
): Promise<LocalSttCurrentOperation | null> {
  const lockPath = getLocalSttLockPath(installRoot);

  try {
    const raw = await readFile(lockPath, "utf8");
    return JSON.parse(raw) as LocalSttCurrentOperation;
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function withLocalSttLock<T>(input: {
  installRoot: string;
  operation: LocalSttCurrentOperation;
  run: () => Promise<T>;
}): Promise<T> {
  const lockPath = getLocalSttLockPath(input.installRoot);
  await mkdir(input.installRoot, { recursive: true });

  let handle;

  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (code === "EEXIST") {
      throw new LocalSttBusyError();
    }

    throw error;
  }

  try {
    await handle.writeFile(JSON.stringify(input.operation, null, 2), "utf8");
    await handle.close();

    return await input.run();
  } finally {
    await rm(lockPath, { force: true });
  }
}
