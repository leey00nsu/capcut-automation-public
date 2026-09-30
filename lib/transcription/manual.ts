import { readTranscript } from "@/lib/files/read-transcript";
import type { ManualTranscriptSource } from "@/types/session";
import type { TranscriptionResult } from "@/lib/transcription/types";

export async function transcribeFromManualFile(input: {
  source: ManualTranscriptSource;
}): Promise<TranscriptionResult> {
  return {
    transcriptText: await readTranscript(input.source.transcriptPath),
    summary: {
      mode: "manual_file",
      engine: "manual_file",
    },
  };
}
