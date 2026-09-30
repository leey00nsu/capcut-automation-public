import { NextResponse } from "next/server";
import { z } from "zod";

import {
  installLocalStt,
  LocalSttConflictError,
  LocalSttValidationError,
} from "@/lib/local-stt/install";
import { LocalSttBusyError } from "@/lib/local-stt/lock";

export const runtime = "nodejs";

const requestSchema = z.object({
  acceptedPlanFingerprint: z.string().trim().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: parsed.error.issues[0]?.message ?? "Invalid request body.",
        },
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await installLocalStt(parsed.data));
  } catch (error) {
    if (error instanceof LocalSttConflictError) {
      return NextResponse.json(
        {
          error: {
            code: "STALE_INSTALL_PLAN",
            message: error.message,
          },
        },
        { status: 409 },
      );
    }

    if (error instanceof LocalSttBusyError) {
      return NextResponse.json(
        {
          error: {
            code: "LOCAL_STT_BUSY",
            message: error.message,
          },
        },
        { status: 409 },
      );
    }

    if (error instanceof LocalSttValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "LOCAL_STT_NOT_SUPPORTED",
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "LOCAL_STT_INSTALL_FAILED",
          message: error instanceof Error ? error.message : "Local STT install failed.",
        },
      },
      { status: 500 },
    );
  }
}
