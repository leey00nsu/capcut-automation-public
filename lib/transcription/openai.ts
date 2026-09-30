import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { buildTimestampedTranscriptText, secondsToTimecode } from "@/lib/transcription/format";
import type { TranscriptionResult } from "@/lib/transcription/types";
import type { TranscriptSegment } from "@/types/session";

type OpenAITranscriptSegment = {
  id?: number | string;
  start?: number;
  end?: number;
  text?: string;
};

type OpenAITranscriptionResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: OpenAITranscriptSegment[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

function normalizeOpenAISegments(
  segments: OpenAITranscriptSegment[] | undefined,
): TranscriptSegment[] {
  const normalized = (segments ?? []).flatMap((segment, index) => {
    if (
      typeof segment.start !== "number" ||
      typeof segment.end !== "number" ||
      typeof segment.text !== "string" ||
      !segment.text.trim()
    ) {
      return [];
    }

    return [
      {
        id: String(segment.id ?? index),
        start: secondsToTimecode(segment.start),
        end: secondsToTimecode(segment.end),
        text: segment.text.trim(),
      },
    ];
  });

  if (normalized.length === 0) {
    throw new Error("OpenAI transcription did not return timestamped segments");
  }

  return normalized;
}

export async function transcribeWithOpenAI(input: {
  apiKey: string;
  audioPath: string;
  model: "whisper-1";
  language?: string;
}): Promise<TranscriptionResult> {
  const audioBuffer = await readFile(input.audioPath);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audioBuffer], { type: "audio/wav" }),
    basename(input.audioPath),
  );
  formData.append("model", input.model);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  if (input.language?.trim()) {
    formData.append("language", input.language.trim());
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `OpenAI transcription failed with ${response.status}: ${details}`,
    );
  }

  const responseBody = (await response.json()) as OpenAITranscriptionResponse;
  const segments = normalizeOpenAISegments(responseBody.segments);

  return {
    transcriptText:
      typeof responseBody.text === "string" && responseBody.text.trim()
        ? buildTimestampedTranscriptText(segments)
        : buildTimestampedTranscriptText(segments),
    segments,
    summary: {
      mode: "api_stt",
      engine: "openai",
      model: input.model,
      ...(responseBody.language?.trim()
        ? { language: responseBody.language.trim() }
        : input.language?.trim()
          ? { language: input.language.trim() }
          : {}),
      ...(responseBody.usage
        ? {
            usage: {
              provider: "openai",
              model: input.model,
              ...(
                typeof responseBody.usage.total_tokens === "number"
                  ? { totalTokens: responseBody.usage.total_tokens }
                  : {}
              ),
              ...(
                typeof responseBody.usage.input_tokens === "number"
                  ? { inputTokens: responseBody.usage.input_tokens }
                  : {}
              ),
              ...(
                typeof responseBody.usage.output_tokens === "number"
                  ? { outputTokens: responseBody.usage.output_tokens }
                  : {}
              ),
            },
          }
        : {}),
    },
  };
}
