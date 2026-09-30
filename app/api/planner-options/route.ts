import { NextResponse } from "next/server";

import { parseStoredPlannerOptions } from "@/lib/planner/options";
import {
  loadPlannerOptions,
  savePlannerOptions,
} from "@/lib/planner/options-store";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await loadPlannerOptions());
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Request body must be valid JSON",
        },
      },
      { status: 400 },
    );
  }

  const options = parseStoredPlannerOptions(JSON.stringify(body));

  if (!options) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid planner options" } },
      { status: 400 },
    );
  }

  return NextResponse.json(await savePlannerOptions(options));
}
