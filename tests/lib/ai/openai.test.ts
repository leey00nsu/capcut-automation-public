import { afterEach, describe, expect, it, vi } from "vitest";

import { planWithOpenAI } from "@/lib/ai/openai";
import { plannerProviderJsonSchema } from "@/lib/ai/schema";

describe("planWithOpenAI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends store false and the explicit provider schema to the Responses API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          source: {
            videoPath: "/tmp/video.mp4",
            transcriptPath: "/tmp/transcript.txt",
            channelName: "예시 채널",
            originalTitle: "원본 제목",
          },
          clips: Array.from({ length: 10 }, (_, index) => ({
            id: `short-${String(index + 1).padStart(3, "0")}`,
            start: `00:00:${String(index * 2).padStart(2, "0")}.000`,
            end: `00:00:${String(index * 2 + 1).padStart(2, "0")}.000`,
            reason: "hook",
            topHighlightCandidates: [
              "강조 문구 1",
              "강조 문구 2",
              "강조 문구 3",
            ],
            topGeneralCandidates: [
              "보조 문구 1",
              "보조 문구 2",
              "보조 문구 3",
            ],
          })),
        }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await planWithOpenAI({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      prompt: "planner prompt",
      jsonSchema: plannerProviderJsonSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    const requestBody = JSON.parse(String(requestInit?.body));

    expect(requestBody.store).toBe(false);
    expect(requestBody.model).toBe("gpt-5.4-mini");
    expect(requestBody.text?.format?.schema).toEqual(plannerProviderJsonSchema);
    expect(result).toMatchObject({
      output: expect.objectContaining({
        source: expect.objectContaining({
          videoPath: "/tmp/video.mp4",
        }),
      }),
    });
  });
});
