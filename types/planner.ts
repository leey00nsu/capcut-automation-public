import type { TranscriptionSummary } from "@/types/session";

export type PlannerSource = {
  videoPath: string;
  transcriptPath: string;
  channelName: string;
  originalTitle: string;
};

export type PlannerProvider = "codex" | "openai";
export type PlannerModel = string;

export type HookTextFewShotExample = {
  highlight: string;
  general: string;
};

export type PlannerSettings = {
  clipCount: number;
  minClipDurationSeconds: 15 | 30 | 60;
  maxClipDurationSeconds: 30 | 60 | 90;
  subtitleCandidateCount: number;
};

export type PlanRequest = PlannerSource & {
  channelImagePath?: string;
  provider: PlannerProvider;
  model: PlannerModel;
  settings: PlannerSettings;
  promptInstructions?: string;
  fewShotExamples?: HookTextFewShotExample[];
  openaiApiKey?: string;
};

export type PlanSnapshotMetadata = {
  outputRootPath: string;
  sessionDirectoryPath: string;
  planFilePath: string;
};

export type PlannerPromptInput = PlannerSource & {
  transcript: string;
  settings: PlannerSettings;
  promptInstructions?: string;
  fewShotExamples?: HookTextFewShotExample[];
};

export type PlannerClip = {
  id: string;
  start: string;
  end: string;
  reason: string;
  topHighlightCandidates: string[];
  topGeneralCandidates: string[];
};

export type PlannerOutput = {
  source: PlannerSource;
  clips: PlannerClip[];
};

export type PlanUsage = {
  provider: PlannerProvider;
  model: string;
  totalTokens: number;
  estimatedCostUsd: number;
  pricingReference: string;
  costMode: "actual_usage" | "rough_estimate";
  note: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningEffort?: string;
  threadId?: string;
};

export type PlanResponse = {
  planId: string;
  sessionId?: string;
  source: PlannerSource;
  settings: PlannerSettings;
  snapshot: PlanSnapshotMetadata;
  transcription?: TranscriptionSummary;
  usage?: PlanUsage;
  clips: PlannerClip[];
};

export type ImportedPlanResponse = PlanResponse & {
  importMetadata: {
    provider: PlannerProvider;
    model: PlannerModel;
    channelImagePath?: string;
  };
};

export type PlanSnapshotFile = {
  savedAt: string;
  provider: PlannerProvider;
  model: PlannerModel;
  channelImagePath?: string;
  outputRootPath: string;
  sessionDirectoryPath: string;
  plan: PlanResponse;
};

export type RecentPlanEntry = {
  savedAt: string;
  planFilePath: string;
  sessionDirectoryPath: string;
  planId: string;
  sessionId?: string;
  originalTitle: string;
  channelName: string;
  videoPath: string;
  clipCount: number;
  provider: PlannerProvider;
  model: PlannerModel;
  transcriptionMode?: TranscriptionSummary["mode"];
};

export type RecentPlansResponse = {
  plans: RecentPlanEntry[];
};
