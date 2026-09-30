import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { extractTranscriptionAudio } from "@/lib/transcription/audio";
import { transcribeWithManagedMlx } from "@/lib/transcription/local-mlx";
import { transcribeWithLocalWhisper } from "@/lib/transcription/local-whisper";
import { transcribeFromManualFile } from "@/lib/transcription/manual";
import { transcribeWithOpenAI } from "@/lib/transcription/openai";
import type { TranscriptionResult } from "@/lib/transcription/types";
import type {
  PlanningSession,
  TranscriptSourceInput,
  TranscriptionArtifactPaths,
  TranscriptionSummary,
} from "@/types/session";

async function writeTranscriptArtifacts(input: {
  session: PlanningSession;
  source: TranscriptSourceInput;
  result: TranscriptionResult;
}): Promise<TranscriptionArtifactPaths> {
  const transcriptsDirectory = join(input.session.rootPath, "transcripts");
  await mkdir(transcriptsDirectory, { recursive: true });

  const transcriptPath = join(transcriptsDirectory, "transcript.txt");
  const segmentsPath = join(transcriptsDirectory, "transcript.segments.json");
  const metadataPath = join(transcriptsDirectory, "transcript.meta.json");

  await writeFile(transcriptPath, input.result.transcriptText, "utf8");

  if (input.result.segments) {
    await writeFile(
      segmentsPath,
      JSON.stringify(input.result.segments, null, 2),
      "utf8",
    );
  }

  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        source: input.source,
        summary: input.result.summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    transcriptPath,
    metadataPath,
    ...(input.result.segments ? { segmentsPath } : {}),
    ...(input.source.mode === "manual_file"
      ? { originalInputPath: input.source.transcriptPath }
      : {}),
  };
}

async function runTranscription(input: {
  session: PlanningSession;
  source: TranscriptSourceInput;
  openaiApiKey?: string;
}): Promise<TranscriptionResult> {
  if (input.source.mode === "manual_file") {
    return transcribeFromManualFile({ source: input.source });
  }

  if (input.source.mode === "local_stt") {
    if (input.source.engine === "mlx_whisper") {
      return transcribeWithManagedMlx({
        videoPath: input.session.source.videoPath,
        modelId: input.source.modelId,
        language: input.source.language,
      });
    }

    const extractedAudioPath = join(
      input.session.rootPath,
      "temp",
      "extracted-audio.wav",
    );
    await extractTranscriptionAudio({
      videoPath: input.session.source.videoPath,
      outputPath: extractedAudioPath,
    });

    return transcribeWithLocalWhisper({
      audioPath: extractedAudioPath,
      modelPath: input.source.modelPath,
      language: input.source.language,
    });
  }

  const extractedAudioPath = join(input.session.rootPath, "temp", "extracted-audio.wav");
  await extractTranscriptionAudio({
    videoPath: input.session.source.videoPath,
    outputPath: extractedAudioPath,
  });

  if (!input.openaiApiKey?.trim()) {
    throw new Error("openaiApiKey is required for API transcription");
  }

  return transcribeWithOpenAI({
    apiKey: input.openaiApiKey.trim(),
    audioPath: extractedAudioPath,
    model: input.source.model,
    language: input.source.language,
  });
}

export async function transcribeForSession(input: {
  session: PlanningSession;
  source: TranscriptSourceInput;
  openaiApiKey?: string;
}): Promise<TranscriptionSummary> {
  const result = await runTranscription(input);
  const artifactPaths = await writeTranscriptArtifacts({
    session: input.session,
    source: input.source,
    result,
  });

  return {
    ...result.summary,
    artifactPaths,
    ...(result.segments ? { segments: result.segments } : {}),
  };
}
