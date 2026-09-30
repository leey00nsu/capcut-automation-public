import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { createPlanningSession } from "@/lib/sessions/store";

export const runtime = "nodejs";

const requestSchema = z.object({
  videoPath: z.string(),
  channelName: z.string().trim().min(1, "channelName is required"),
  originalTitle: z.string().trim().min(1, "originalTitle is required"),
  channelImagePath: z.string().optional(),
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

async function parseRequest(request: Request): Promise<z.infer<typeof requestSchema>> {
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

  return {
    ...parsed.data,
    videoPath: await ensureReadableFilePath(parsed.data.videoPath, "video path"),
    channelName: parsed.data.channelName.trim(),
    originalTitle: parsed.data.originalTitle.trim(),
    channelImagePath: parsed.data.channelImagePath?.trim(),
  };
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
    const session = await createPlanningSession(input);
    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";

    return jsonError(500, "SESSION_CREATE_ERROR", message);
  }
}
