import { NextResponse } from "next/server";

import { repairLocalStt, LocalSttValidationError } from "@/lib/local-stt/install";
import { LocalSttBusyError } from "@/lib/local-stt/lock";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await repairLocalStt());
  } catch (error) {
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
          code: "LOCAL_STT_REPAIR_FAILED",
          message: error instanceof Error ? error.message : "Local STT repair failed.",
        },
      },
      { status: 500 },
    );
  }
}
