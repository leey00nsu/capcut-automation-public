import { NextResponse } from "next/server";
import { z } from "zod";

import { loadPlanSnapshot } from "@/lib/plans/snapshot";

export const runtime = "nodejs";

const requestSchema = z.object({
  planFilePath: z.string(),
});

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

async function parseRequest(
  request: Request,
): Promise<z.infer<typeof requestSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  return parsed.data;
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: z.infer<typeof requestSchema>;

  try {
    input = await parseRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request body";

    return jsonError(400, "INVALID_INPUT", message);
  }

  try {
    const plan = await loadPlanSnapshot(input.planFilePath);
    return NextResponse.json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import plan";

    return jsonError(400, "INVALID_INPUT", message);
  }
}
