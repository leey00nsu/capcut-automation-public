import { NextResponse } from "next/server";
import { z } from "zod";

import { planWithCodex } from "@/lib/ai/codex";
import { planWithOpenAI } from "@/lib/ai/openai";
import { buildPlannerPrompt } from "@/lib/ai/prompt";
import {
  createPlannerOutputSchema,
  createPlannerProviderJsonSchema,
  normalizePlannerClipDurations,
} from "@/lib/ai/schema";
import {
  ensureReadableFilePath,
} from "@/lib/files/paths";
import { readTranscript } from "@/lib/files/read-transcript";
import { plannerSettingsSchema } from "@/lib/planner/settings";
import { savePlanSnapshot } from "@/lib/plans/snapshot";
import type { ProviderPlanResult } from "@/lib/ai/provider-result";
import type { PlanRequest, PlanResponse, PlannerOutput } from "@/types/planner";

export const runtime = "nodejs";

const requestSchema: z.ZodType<PlanRequest> = z
  .object({
    videoPath: z.string(),
    transcriptPath: z.string(),
    channelName: z.string().trim().min(1, "channelName is required"),
    originalTitle: z.string().trim().min(1, "originalTitle is required"),
    channelImagePath: z.string().optional(),
    provider: z.enum(["codex", "openai"]),
    model: z.string().trim().min(1).max(200),
    settings: plannerSettingsSchema,
    promptInstructions: z.string().trim().min(1).max(20_000).optional(),
    fewShotExamples: z
      .array(
        z.object({
          highlight: z.string().trim().min(1).max(200),
          general: z.string().trim().min(1).max(300),
        }),
      )
      .min(1)
      .max(500)
      .optional(),
    openaiApiKey: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.provider !== "openai") {
      return;
    }

    if (!value.openaiApiKey?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "openaiApiKey is required for the openai provider",
        path: ["openaiApiKey"],
      });
    }
  });

function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
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

async function parseRequest(request: Request): Promise<PlanRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid request body");
  }

  return {
    ...parsed.data,
    channelName: parsed.data.channelName.trim(),
    originalTitle: parsed.data.originalTitle.trim(),
    channelImagePath: parsed.data.channelImagePath?.trim(),
    model: parsed.data.model,
    openaiApiKey: parsed.data.openaiApiKey?.trim(),
  };
}

async function validateSourcePaths(input: PlanRequest) {
  const [videoPath, transcriptPath] = await Promise.all([
    ensureReadableFilePath(input.videoPath, "video path"),
    ensureReadableFilePath(input.transcriptPath, "transcript path"),
  ]);

  return {
    videoPath,
    transcriptPath,
    channelName: input.channelName,
    originalTitle: input.originalTitle,
  };
}

async function requestProviderPlan(
  input: PlanRequest,
  prompt: string,
  jsonSchema: object,
): Promise<ProviderPlanResult> {
  if (input.provider === "codex") {
    return planWithCodex(prompt, input.model, jsonSchema);
  }

  return planWithOpenAI({
    apiKey: input.openaiApiKey ?? "",
    model: input.model,
    prompt,
    jsonSchema,
  });
}

function normalizePlanResponse(
  source: PlanResponse["source"],
  settings: PlanResponse["settings"],
  plannerOutput: PlannerOutput,
  usage?: PlanResponse["usage"],
): Omit<PlanResponse, "snapshot"> {
  return {
    planId: crypto.randomUUID(),
    source,
    settings,
    ...(usage ? { usage } : {}),
    clips: plannerOutput.clips,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: PlanRequest;

  try {
    input = await parseRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request body";

    return jsonError(400, "INVALID_INPUT", message);
  }

  let source: PlanResponse["source"];

  try {
    const validated = await validateSourcePaths(input);
    source = {
      videoPath: validated.videoPath,
      transcriptPath: validated.transcriptPath,
      channelName: validated.channelName,
      originalTitle: validated.originalTitle,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid paths";
    return jsonError(400, "INVALID_INPUT", message);
  }

  let transcript: string;

  try {
    transcript = await readTranscript(source.transcriptPath);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read transcript";

    return jsonError(502, "TRANSCRIPT_READ_ERROR", message);
  }

  const prompt = buildPlannerPrompt({
    ...source,
    transcript,
    settings: input.settings,
    promptInstructions: input.promptInstructions,
    fewShotExamples: input.fewShotExamples,
  });
  const providerJsonSchema = createPlannerProviderJsonSchema(input.settings);
  const plannerOutputSchema = createPlannerOutputSchema(input.settings);

  let providerResult: ProviderPlanResult;

  try {
    providerResult = await requestProviderPlan(input, prompt, providerJsonSchema);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Planner provider failed";

    return jsonError(502, "PROVIDER_ERROR", message);
  }

  const parsedOutput = plannerOutputSchema.safeParse(
    normalizePlannerClipDurations(providerResult.output, input.settings),
  );

  if (!parsedOutput.success) {
    return jsonError(
      502,
      "INVALID_PROVIDER_OUTPUT",
      parsedOutput.error.issues[0]?.message ?? "Provider output is invalid",
    );
  }

  try {
    const snapshot = await savePlanSnapshot({
      provider: input.provider,
      model: input.model,
      channelImagePath: input.channelImagePath,
      plan: normalizePlanResponse(
        source,
        input.settings,
        parsedOutput.data,
        providerResult.usage,
      ),
    });

    return NextResponse.json(snapshot.plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save plan snapshot";

    return jsonError(500, "PLAN_SAVE_ERROR", message);
  }
}
