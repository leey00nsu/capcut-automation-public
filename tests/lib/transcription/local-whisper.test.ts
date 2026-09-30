import { describe, expect, it } from "vitest";

import { parseWhisperSegments } from "@/lib/transcription/local-whisper";

describe("parseWhisperSegments", () => {
  it("extracts timestamped segments from whisper-cli stdout", () => {
    const segments = parseWhisperSegments(`
whisper_model_load: loading model
[00:00:00.000 --> 00:00:01.250] 첫 번째 문장
[00:00:01.250 --> 00:00:02.500] 둘째 문장
`);

    expect(segments).toEqual([
      {
        id: "seg-001",
        start: "00:00:00.000",
        end: "00:00:01.250",
        text: "첫 번째 문장",
      },
      {
        id: "seg-002",
        start: "00:00:01.250",
        end: "00:00:02.500",
        text: "둘째 문장",
      },
    ]);
  });
});
