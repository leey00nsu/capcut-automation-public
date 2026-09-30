import { NextResponse } from "next/server";
import { z } from "zod";

import { listRecentPlanSnapshots } from "@/lib/plans/snapshot";

export const runtime = "nodejs";

const limitSchema = z.coerce.number().int().min(1).max(20).default(8);

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

export async function GET(request: Request): Promise<NextResponse> {
  const rawLimit = new URL(request.url).searchParams.get("limit") ?? undefined;
  const parsedLimit = limitSchema.safeParse(rawLimit);

  if (!parsedLimit.success) {
    return jsonError(
      400,
      "INVALID_INPUT",
      parsedLimit.error.issues[0]?.message ?? "Invalid limit",
    );
  }

  try {
    const plans = await listRecentPlanSnapshots({ limit: parsedLimit.data });

    return NextResponse.json({ plans });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recent plans";

    return jsonError(500, "RECENT_PLANS_ERROR", message);
  }
}
