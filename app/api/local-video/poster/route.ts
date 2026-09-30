import { NextResponse } from "next/server";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { extractVideoPoster } from "@/lib/media/poster";

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

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const time = searchParams.get("time");

  if (!path?.trim() || !time?.trim()) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "path and time query parameters are required",
    );
  }

  const timeSeconds = Number(time);

  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    return jsonError(400, "INVALID_INPUT", "time must be a positive number");
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

  try {
    const buffer = await extractVideoPoster({
      videoPath: resolvedPath,
      timeSeconds,
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(
      500,
      "POSTER_EXTRACTION_ERROR",
      error instanceof Error ? error.message : "Failed to extract poster",
    );
  }
}
