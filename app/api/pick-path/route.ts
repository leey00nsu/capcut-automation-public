import { NextResponse } from "next/server";
import { z } from "zod";

import { pickPath } from "@/lib/files/pick-path";

export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["file", "directory"]),
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
    const path = await pickPath(input.mode);

    return NextResponse.json(
      path
        ? { canceled: false, path }
        : { canceled: true },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to pick path";

    return jsonError(500, "PATH_PICKER_ERROR", message);
  }
}
