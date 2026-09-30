import { NextResponse } from "next/server";

import { resolveLocalSttStatus } from "@/lib/local-stt/status";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await resolveLocalSttStatus());
}
