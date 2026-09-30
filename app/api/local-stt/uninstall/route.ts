import { NextResponse } from "next/server";

import { uninstallLocalStt } from "@/lib/local-stt/install";
import { LocalSttBusyError } from "@/lib/local-stt/lock";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await uninstallLocalStt());
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

    return NextResponse.json(
      {
        error: {
          code: "LOCAL_STT_UNINSTALL_FAILED",
          message: error instanceof Error ? error.message : "Local STT uninstall failed.",
        },
      },
      { status: 500 },
    );
  }
}
