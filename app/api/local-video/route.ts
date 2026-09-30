import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";

import { NextResponse } from "next/server";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { createFileStreamResponse } from "@/lib/http/file-stream-response";

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
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".m4v":
      return "video/x-m4v";
    default:
      return "application/octet-stream";
  }
}

function parseRangeHeader(
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());

  if (!match) {
    throw new Error("Malformed Range header");
  }

  const hasStart = match[1].length > 0;
  const hasEnd = match[2].length > 0;

  if (!hasStart && !hasEnd) {
    throw new Error("Malformed Range header");
  }

  let start = hasStart ? Number(match[1]) : 0;
  let end = hasEnd ? Number(match[2]) : fileSize - 1;

  if (!hasStart && hasEnd) {
    const suffixLength = Number(match[2]);
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    throw new RangeError("Requested range is not satisfiable");
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path?.trim()) {
    return jsonError(400, "INVALID_INPUT", "path query parameter is required");
  }

  let resolvedPath: string;

  try {
    resolvedPath = await ensureReadableFilePath(path, "video path");
  } catch (error) {
    return jsonError(
      400,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Invalid video path",
    );
  }

  let fileSize = 0;

  try {
    fileSize = (await stat(resolvedPath)).size;
  } catch (error) {
    return jsonError(
      500,
      "VIDEO_READ_ERROR",
      error instanceof Error ? error.message : "Failed to stat video",
    );
  }

  let range: { start: number; end: number } | null;

  try {
    range = parseRangeHeader(request.headers.get("range"), fileSize);
  } catch (error) {
    if (error instanceof RangeError) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    return jsonError(
      400,
      "INVALID_RANGE",
      error instanceof Error ? error.message : "Invalid Range header",
    );
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? fileSize - 1;
  const stream = createReadStream(resolvedPath, { start, end });

  return createFileStreamResponse(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": contentTypeFromPath(resolvedPath),
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${fileSize}` } : {}),
      "Cache-Control": "no-store",
    },
  });
}
