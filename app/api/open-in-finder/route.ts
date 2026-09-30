import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { z } from "zod";

import { openInFinder } from "@/lib/files/open-in-finder";

export const runtime = "nodejs";

const requestSchema = z.object({
  path: z.string().trim().min(1, "path is required"),
});

const pathErrorCodes = new Set([
  "ENOENT",
  "ENOTDIR",
  "EINVAL",
  "EISDIR",
  "ERR_INVALID_ARG_TYPE",
  "ERR_INVALID_ARG_VALUE",
]);

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function isPathRelatedError(error: unknown): boolean {
  if (error instanceof Error) {
    if (
      error.message === "Path must point to an existing file or directory" ||
      error.message.startsWith("Path is not a file or directory:")
    ) {
      return true;
    }
  }

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;

  return code !== undefined && pathErrorCodes.has(code);
}

async function parseRequest(request: Request): Promise<{ path: string }> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  return parsed.data;
}

async function validatePath(path: string): Promise<void> {
  try {
    const pathStat = await stat(path);

    if (!pathStat.isDirectory() && !pathStat.isFile()) {
      throw new Error("Path must point to an existing file or directory");
    }
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (
      code === "ENOENT" ||
      code === "ENOTDIR" ||
      code === "EINVAL" ||
      code === "EISDIR"
    ) {
      throw new Error("Path must point to an existing file or directory");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Path must point to an existing file or directory");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: { path: string };

  try {
    input = await parseRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request body";

    return jsonError(400, "INVALID_INPUT", message);
  }

  try {
    await validatePath(input.path);
    await openInFinder(input.path);
  } catch (error) {
    if (isPathRelatedError(error)) {
      return jsonError(
        400,
        "INVALID_INPUT",
        "Path must point to an existing file or directory",
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to open path in Finder";

    return jsonError(500, "OPEN_IN_FINDER_ERROR", message);
  }

  return NextResponse.json({ ok: true });
}
