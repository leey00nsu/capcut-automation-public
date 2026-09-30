import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { createFileStreamResponse } from "@/lib/http/file-stream-response";
import { getSegmentFilePath } from "@/lib/media/segment";

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

function parseNumber(value: string | null, label: string): number {
  if (!value?.trim()) {
    throw new Error(`${label} query parameter is required`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} query parameter must be a finite number`);
  }

  return parsed;
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

  let startSeconds = 0;
  let endSeconds = 0;
  let resolvedPath: string;

  try {
    startSeconds = parseNumber(searchParams.get("start"), "start");
    endSeconds = parseNumber(searchParams.get("end"), "end");
    resolvedPath = await ensureReadableFilePath(path, "video path");
  } catch (error) {
    return jsonError(
      400,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Invalid segment parameters",
    );
  }

  let segmentPath: string;

  try {
    segmentPath = await getSegmentFilePath({
      videoPath: resolvedPath,
      startSeconds,
      endSeconds,
    });
  } catch (error) {
    return jsonError(
      500,
      "VIDEO_SEGMENT_ERROR",
      error instanceof Error ? error.message : "Failed to create video segment",
    );
  }

  let fileSize = 0;

  try {
    fileSize = (await stat(segmentPath)).size;
  } catch (error) {
    return jsonError(
      500,
      "VIDEO_READ_ERROR",
      error instanceof Error ? error.message : "Failed to stat segment",
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
  const stream = createReadStream(segmentPath, { start, end });

  return createFileStreamResponse(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${fileSize}` } : {}),
      "Cache-Control": "no-store",
    },
  });
}
