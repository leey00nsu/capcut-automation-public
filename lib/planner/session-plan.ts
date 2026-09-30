import { z } from "zod";

import { planWithCodex } from "@/lib/ai/codex";
import { planWithOpenAI } from "@/lib/ai/openai";
import { buildPlannerPrompt } from "@/lib/ai/prompt";
import {
  createPlannerOutputSchema,
  createPlannerProviderJsonSchema,
  normalizePlannerClipDurations,
} from "@/lib/ai/schema";
import { readTranscript } from "@/lib/files/read-transcript";
import { savePlanSnapshotForSession } from "@/lib/plans/snapshot";
import { plannerSettingsSchema } from "@/lib/planner/settings";
import type { ProviderPlanResult } from "@/lib/ai/provider-result";
import type { PlanningSession } from "@/types/session";
import type { PlanResponse, PlannerModel, PlannerProvider } from "@/types/planner";

const sessionPlanRequestSchema = z
  .object({
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
    if (value.provider === "openai" && !value.openaiApiKey?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "openaiApiKey is required for the openai provider",
        path: ["openaiApiKey"],
      });
    }
  });

export type SessionPlanRequest = z.infer<typeof sessionPlanRequestSchema>;

export function parseSessionPlanRequest(body: unknown): SessionPlanRequest {
  const parsed = sessionPlanRequestSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  return {
    ...parsed.data,
    openaiApiKey: parsed.data.openaiApiKey?.trim(),
  };
}

async function requestProviderPlan(
  input: {
    provider: PlannerProvider;
    model: PlannerModel;
    prompt: string;
    jsonSchema: object;
    openaiApiKey?: string;
  },
): Promise<ProviderPlanResult> {
  if (input.provider === "codex") {
    return planWithCodex(input.prompt, input.model, input.jsonSchema);
  }

  return planWithOpenAI({
    apiKey: input.openaiApiKey ?? "",
    model: input.model,
    prompt: input.prompt,
    jsonSchema: input.jsonSchema,
  });
}

export async function planForSession(input: {
  session: PlanningSession;
  provider: PlannerProvider;
  model: PlannerModel;
  settings: SessionPlanRequest["settings"];
  promptInstructions?: string;
  fewShotExamples?: SessionPlanRequest["fewShotExamples"];
  openaiApiKey?: string;
}): Promise<PlanResponse> {
  if (!input.session.latestTranscription) {
    throw new Error("A completed transcription is required before planning");
  }

  const transcriptPath = input.session.latestTranscription.artifactPaths.transcriptPath;
  const transcript = await readTranscript(transcriptPath);
  const source = {
    videoPath: input.session.source.videoPath,
    transcriptPath,
    channelName: input.session.source.channelName,
    originalTitle: input.session.source.originalTitle,
  };
  const prompt = buildPlannerPrompt({
    ...source,
    transcript,
    settings: input.settings,
    promptInstructions: input.promptInstructions,
    fewShotExamples: input.fewShotExamples,
  });
  const providerJsonSchema = createPlannerProviderJsonSchema(input.settings);
  const plannerOutputSchema = createPlannerOutputSchema(input.settings);
  const providerResult = await requestProviderPlan({
    provider: input.provider,
    model: input.model,
    prompt,
    jsonSchema: providerJsonSchema,
    openaiApiKey: input.openaiApiKey,
  });
  const parsedOutput = plannerOutputSchema.safeParse(
    normalizePlannerClipDurations(providerResult.output, input.settings),
  );

  if (!parsedOutput.success) {
    throw new Error(
      parsedOutput.error.issues[0]?.message ?? "Provider output is invalid",
    );
  }

  const snapshot = await savePlanSnapshotForSession({
    provider: input.provider,
    model: input.model,
    sessionId: input.session.sessionId,
    sessionDirectoryPath: input.session.rootPath,
    channelImagePath: input.session.source.channelImagePath,
    plan: {
      planId: crypto.randomUUID(),
      sessionId: input.session.sessionId,
      source,
      settings: input.settings,
      transcription: input.session.latestTranscription,
      ...(providerResult.usage ? { usage: providerResult.usage } : {}),
      clips: parsedOutput.data.clips,
    },
  });

  return snapshot.plan;
}
