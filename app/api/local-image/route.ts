import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { NextResponse } from "next/server";

import { ensureReadableFilePath } from "@/lib/files/paths";

export const runtime = "nodejs";

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

function contentTypeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path?.trim()) {
    return jsonError(400, "INVALID_INPUT", "path query parameter is required");
  }

  let resolvedPath: string;

  try {
    resolvedPath = await ensureReadableFilePath(path, "image path");
  } catch (error) {
    return jsonError(
      400,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Invalid image path",
    );
  }

  try {
    const buffer = await readFile(resolvedPath);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromPath(resolvedPath),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(
      500,
      "IMAGE_READ_ERROR",
      error instanceof Error ? error.message : "Failed to read image",
    );
  }
}
