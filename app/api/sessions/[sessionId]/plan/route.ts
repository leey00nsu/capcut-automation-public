import { NextResponse } from "next/server";

import { planForSession, parseSessionPlanRequest } from "@/lib/planner/session-plan";
import { loadPlanningSession, writePlanningSession } from "@/lib/sessions/store";
import type { PlanningSessionJob } from "@/types/session";

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

function createPlanJob(
  input: ReturnType<typeof parseSessionPlanRequest>,
): PlanningSessionJob {
  const now = new Date().toISOString();

  return {
    id: `job-plan-${crypto.randomUUID()}`,
    kind: "plan",
    status: "running",
    createdAt: now,
    updatedAt: now,
    input: {
      provider: input.provider,
      model: input.model,
      settings: input.settings,
    },
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await context.params;

  let parsedRequest;

  try {
    parsedRequest = parseSessionPlanRequest(await request.json());
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

  if (!session.latestTranscription) {
    return jsonError(
      409,
      "INVALID_STATE",
      "A completed transcription is required before planning",
    );
  }

  const job = createPlanJob(parsedRequest);
  session.jobs.push(job);
  session.updatedAt = job.updatedAt;
  await writePlanningSession(session);

  try {
    const plan = await planForSession({
      session,
      provider: parsedRequest.provider,
      model: parsedRequest.model,
      settings: parsedRequest.settings,
      promptInstructions: parsedRequest.promptInstructions,
      fewShotExamples: parsedRequest.fewShotExamples,
      openaiApiKey: parsedRequest.openaiApiKey,
    });
    const completedAt = new Date().toISOString();
    const updatedSession = {
      ...session,
      updatedAt: completedAt,
      latestPlanId: plan.planId,
      latestPlanFilePath: plan.snapshot.planFilePath,
      jobs: session.jobs.map((candidate) =>
        candidate.id === job.id
          ? {
              ...candidate,
              status: "completed" as const,
              updatedAt: completedAt,
              completedAt,
              planId: plan.planId,
              planFilePath: plan.snapshot.planFilePath,
            }
          : candidate,
      ),
    };
    await writePlanningSession(updatedSession);

    return NextResponse.json(plan);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Planning failed";
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

    return jsonError(502, "PROVIDER_ERROR", message);
  }
}
