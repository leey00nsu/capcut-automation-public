import type {
  TranscriptSegment,
  TranscriptSourceInput,
  TranscriptionSummary,
} from "@/types/session";

export type TranscriptArtifacts = {
  transcriptPath: string;
  segmentsPath?: string;
  metadataPath: string;
};

export type TranscriptionResult = {
  transcriptText: string;
  segments?: TranscriptSegment[];
  summary: Omit<TranscriptionSummary, "artifactPaths">;
};

export type TranscriptionRequestContext = {
  videoPath: string;
  source: TranscriptSourceInput;
};

export type TranscriptFileWriteInput = {
  transcriptText: string;
  segments?: TranscriptSegment[];
  metadata: Record<string, unknown>;
};
