import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { readLocalSttLock } from "@/lib/local-stt/lock";
import { resolveLocalSttStatus } from "@/lib/local-stt/status";
import {
  loadPlanningSession,
  writePlanningSession,
} from "@/lib/sessions/store";
import { transcribeForSession } from "@/lib/transcription/service";
import type { PlanningSessionJob, TranscriptSourceInput } from "@/types/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  transcriptSource: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("manual_file"),
      transcriptPath: z.string(),
    }),
    z.object({
      mode: z.literal("local_stt"),
      engine: z.enum(["whisper_cpp", "mlx_whisper"]),
      modelId: z.string().optional(),
      modelPath: z.string().optional(),
      language: z.string().optional(),
    }),
    z.object({
      mode: z.literal("api_stt"),
      provider: z.literal("openai"),
      model: z.literal("whisper-1"),
      language: z.string().optional(),
    }),
  ]),
  openaiApiKey: z.string().optional(),
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

async function parseRequest(request: Request): Promise<{
  transcriptSource: TranscriptSourceInput;
  openaiApiKey?: string;
}> {
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

  if (parsed.data.transcriptSource.mode === "manual_file") {
    return {
      transcriptSource: {
        ...parsed.data.transcriptSource,
        transcriptPath: await ensureReadableFilePath(
          parsed.data.transcriptSource.transcriptPath,
          "transcript path",
        ),
      },
      openaiApiKey: parsed.data.openaiApiKey?.trim(),
    };
  }

  return {
    transcriptSource: {
      ...parsed.data.transcriptSource,
      ...("modelId" in parsed.data.transcriptSource &&
      parsed.data.transcriptSource.modelId?.trim()
        ? { modelId: parsed.data.transcriptSource.modelId.trim() }
        : {}),
      ...("modelPath" in parsed.data.transcriptSource &&
      parsed.data.transcriptSource.modelPath?.trim()
        ? { modelPath: parsed.data.transcriptSource.modelPath.trim() }
        : {}),
      ...("language" in parsed.data.transcriptSource &&
      parsed.data.transcriptSource.language?.trim()
        ? { language: parsed.data.transcriptSource.language.trim() }
        : {}),
    } as TranscriptSourceInput,
    openaiApiKey: parsed.data.openaiApiKey?.trim(),
  };
}

function createTranscriptionJob(input: TranscriptSourceInput): PlanningSessionJob {
  const now = new Date().toISOString();

  return {
    id: `job-transcribe-${crypto.randomUUID()}`,
    kind: "transcribe",
    status: "running",
    createdAt: now,
    updatedAt: now,
    input,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await context.params;

  let parsedRequest: Awaited<ReturnType<typeof parseRequest>>;

  try {
    parsedRequest = await parseRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request body";

    return jsonError(400, "INVALID_INPUT", message);
  }

  let session;

  try {
    session = await loadPlanningSession(sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load session";

    return jsonError(404, "SESSION_NOT_FOUND", message);
  }

  if (parsedRequest.transcriptSource.mode === "local_stt") {
    const localTranscriptSource =
      parsedRequest.transcriptSource as Extract<
        TranscriptSourceInput,
        { mode: "local_stt" }
      >;

    if (localTranscriptSource.engine === "mlx_whisper") {
      const localSttLock = await readLocalSttLock();

      if (localSttLock) {
        return jsonError(
          409,
          "LOCAL_STT_BUSY",
          "Local STT setup is currently busy. Try again after the install finishes.",
        );
      }

      const localSttStatus = await resolveLocalSttStatus();

      if (localSttStatus.setup.status !== "ready") {
        return jsonError(
          409,
          "LOCAL_STT_NOT_READY",
          "Local STT is not ready. Install or repair the managed runtime first.",
        );
      }
    }
  }

  const job = createTranscriptionJob(parsedRequest.transcriptSource);
  session.jobs.push(job);
  session.updatedAt = job.updatedAt;
  await writePlanningSession(session);

  try {
    const summary = await transcribeForSession({
      session,
      source: parsedRequest.transcriptSource,
      openaiApiKey: parsedRequest.openaiApiKey,
    });
    const completedAt = new Date().toISOString();
    const updatedSession = {
      ...session,
      updatedAt: completedAt,
      latestTranscription: summary,
      jobs: session.jobs.map((candidate) =>
        candidate.id === job.id
          ? {
              ...candidate,
              status: "completed" as const,
              updatedAt: completedAt,
              completedAt,
              result: summary,
            }
          : candidate,
      ),
    };
    await writePlanningSession(updatedSession);

    return NextResponse.json(updatedSession);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    const updatedSession = {
      ...session,
      updatedAt: failedAt,
      jobs: session.jobs.map((candidate) =>
        candidate.id === job.id
          ? {
              ...candidate,
              status: "failed" as const,
              updatedAt: failedAt,
              completedAt: failedAt,
              error: message,
            }
          : candidate,
      ),
    };
    await writePlanningSession(updatedSession);

    return jsonError(502, "TRANSCRIPTION_ERROR", message);
  }
}
