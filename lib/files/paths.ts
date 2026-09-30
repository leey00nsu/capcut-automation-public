import { access, constants, stat } from "node:fs/promises";
import { resolve } from "node:path";

function normalizePathInput(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return resolve(normalized);
}

function buildPathMessage(
  label: string,
  kind: "missing" | "wrong_type" | "not_readable",
  resolvedPath: string,
  expectedType: "file" | "directory",
): string {
  if (kind === "missing") {
    return `${label} does not exist: ${resolvedPath}`;
  }

  if (kind === "wrong_type") {
    return `${label} is not a ${expectedType}: ${resolvedPath}`;
  }

  return `${label} is not readable or accessible: ${resolvedPath}`;
}

async function assertPathType(
  value: string,
  label: string,
  expectDirectory: boolean,
): Promise<string> {
  const resolvedPath = normalizePathInput(value, label);
  const expectedType = expectDirectory ? "directory" : "file";
  const accessMode = expectDirectory
    ? constants.R_OK | constants.X_OK
    : constants.R_OK;

  try {
    const pathStat = await stat(resolvedPath);

    if (expectDirectory ? !pathStat.isDirectory() : !pathStat.isFile()) {
      throw new Error(
        buildPathMessage(label, "wrong_type", resolvedPath, expectedType),
      );
    }

    await access(resolvedPath, accessMode);
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (code === "ENOENT") {
      throw new Error(
        buildPathMessage(label, "missing", resolvedPath, expectedType),
      );
    }

    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        buildPathMessage(label, "not_readable", resolvedPath, expectedType),
      );
    }

    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(
      buildPathMessage(label, "not_readable", resolvedPath, expectedType),
    );
  }

  return resolvedPath;
}

export async function ensureReadableFilePath(
  value: string,
  label = "file path",
): Promise<string> {
  return assertPathType(value, label, false);
}

export async function ensureExistingDirectoryPath(
  value: string,
  label = "directory path",
): Promise<string> {
  return assertPathType(value, label, true);
}
