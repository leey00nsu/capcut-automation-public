import { NextResponse } from "next/server";

import { loadPlanningSession } from "@/lib/sessions/store";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await context.params;

  try {
    const session = await loadPlanningSession(sessionId);
    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load session";

    return jsonError(404, "SESSION_NOT_FOUND", message);
  }
}
