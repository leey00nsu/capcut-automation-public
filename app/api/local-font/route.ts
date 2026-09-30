import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { NextResponse } from "next/server";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { getTemplateFontPath } from "@/lib/capcut/template-defaults";

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
    case ".otf":
      return "font/otf";
    case ".ttf":
      return "font/ttf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("template") === "1"
    ? getTemplateFontPath()
    : searchParams.get("path");

  if (!path?.trim()) {
    return jsonError(400, "INVALID_INPUT", "path query parameter is required");
  }

  let resolvedPath: string;

  try {
    resolvedPath = await ensureReadableFilePath(path, "font path");
  } catch (error) {
    return jsonError(
      400,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Invalid font path",
    );
  }

  try {
    const buffer = await readFile(resolvedPath);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromPath(resolvedPath),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(
      500,
      "FONT_READ_ERROR",
      error instanceof Error ? error.message : "Failed to read font",
    );
  }
}
