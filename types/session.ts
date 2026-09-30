import type {
  PlannerModel,
  PlannerProvider,
  PlannerSettings,
} from "@/types/planner";

export type TranscriptSourceMode = "manual_file" | "local_stt" | "api_stt";
export type LocalTranscriptionEngine = "whisper_cpp" | "mlx_whisper";
export type ApiTranscriptionProvider = "openai";
export type ApiTranscriptionModel = "whisper-1";

export type ManualTranscriptSource = {
  mode: "manual_file";
  transcriptPath: string;
};

export type LocalTranscriptSource = {
  mode: "local_stt";
  engine: LocalTranscriptionEngine;
  modelId?: string;
  modelPath?: string;
  language?: string;
};

export type ApiTranscriptSource = {
  mode: "api_stt";
  provider: ApiTranscriptionProvider;
  model: ApiTranscriptionModel;
  language?: string;
};

export type TranscriptSourceInput =
  | ManualTranscriptSource
  | LocalTranscriptSource
  | ApiTranscriptSource;

export type TranscriptSegment = {
  id: string;
  start: string;
  end: string;
  text: string;
  speaker?: string;
};

export type TranscriptionUsage = {
  provider: "local" | "openai";
  model: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  pricingReference?: string;
  note?: string;
};

export type TranscriptionArtifactPaths = {
  transcriptPath: string;
  segmentsPath?: string;
  metadataPath: string;
  originalInputPath?: string;
};

export type TranscriptionSummary = {
  mode: TranscriptSourceMode;
  engine: string;
  model?: string;
  language?: string;
  usage?: TranscriptionUsage;
  artifactPaths: TranscriptionArtifactPaths;
  segments?: TranscriptSegment[];
};

export type SessionJobStatus = "running" | "completed" | "failed";

type SessionJobBase = {
  id: string;
  status: SessionJobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
};

export type TranscribeSessionJob = SessionJobBase & {
  kind: "transcribe";
  input: TranscriptSourceInput;
  result?: TranscriptionSummary;
};

export type PlanJobInput = {
  provider: PlannerProvider;
  model: PlannerModel;
  settings: PlannerSettings;
};

export type PlanSessionJob = SessionJobBase & {
  kind: "plan";
  input: PlanJobInput;
  planId?: string;
  planFilePath?: string;
};

export type PlanningSessionJob = TranscribeSessionJob | PlanSessionJob;

export type PlanningSessionSource = {
  videoPath: string;
  channelName: string;
  originalTitle: string;
  channelImagePath?: string;
};

export type PlanningSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  rootPath: string;
  source: PlanningSessionSource;
  jobs: PlanningSessionJob[];
  latestTranscription?: TranscriptionSummary;
  latestPlanId?: string;
  latestPlanFilePath?: string;
};
