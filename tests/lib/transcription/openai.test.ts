import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { transcribeWithOpenAI } from "@/lib/transcription/openai";

const createdRoots: string[] = [];

describe("transcribeWithOpenAI", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("uploads audio with verbose_json and returns normalized segments", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-openai-transcribe-"));
    createdRoots.push(rootDirectory);
    const audioPath = join(rootDirectory, "audio.wav");
    await writeFile(audioPath, "fake wav bytes", "utf8");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "첫 번째 문장 둘째 문장",
        language: "ko",
        duration: 2.5,
        segments: [
          {
            id: 0,
            start: 0,
            end: 1.25,
            text: "첫 번째 문장",
          },
          {
            id: 1,
            start: 1.25,
            end: 2.5,
            text: "둘째 문장",
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeWithOpenAI({
      apiKey: "test-key",
      audioPath,
      model: "whisper-1",
      language: "ko",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;

    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("response_format")).toBe("verbose_json");
    expect(body.get("timestamp_granularities[]")).toBe("segment");
    expect(result.summary.language).toBe("ko");
    expect(result.summary.usage).toMatchObject({
      provider: "openai",
      model: "whisper-1",
      totalTokens: 30,
    });
    expect(result.segments).toEqual([
      {
        id: "0",
        start: "00:00:00.000",
        end: "00:00:01.250",
        text: "첫 번째 문장",
      },
      {
        id: "1",
        start: "00:00:01.250",
        end: "00:00:02.500",
        text: "둘째 문장",
      },
    ]);
  });
});
