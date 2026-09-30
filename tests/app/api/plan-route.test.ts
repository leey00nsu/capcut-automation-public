import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { planWithCodexMock, planWithOpenAIMock, readTranscriptMock } = vi.hoisted(() => ({
  planWithCodexMock: vi.fn(),
  planWithOpenAIMock: vi.fn(),
  readTranscriptMock: vi.fn(),
}));

vi.mock("@/lib/ai/codex", () => ({
  planWithCodex: planWithCodexMock,
}));

vi.mock("@/lib/ai/openai", () => ({
  planWithOpenAI: planWithOpenAIMock,
}));

vi.mock("@/lib/files/read-transcript", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files/read-transcript")>();

  return {
    ...actual,
    readTranscript: readTranscriptMock,
  };
});

const { POST } = await import("@/app/api/plan/route");

async function createTempFile(
  prefix: string,
  name: string,
  content: string,
): Promise<{ directory: string; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const filePath = join(directory, name);

  await writeFile(filePath, content, "utf8");

  return { directory, filePath };
}

function formatTimecode(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000`;
}

function createClip(index: number) {
  const startSecond = index * 40;
  const endSecond = index * 40 + 20;

  return {
    id: `short-${String(index + 1).padStart(3, "0")}`,
    start: formatTimecode(startSecond),
    end: formatTimecode(endSecond),
    reason: "hook",
    topHighlightCandidates: ["강조 문구 1", "강조 문구 2", "강조 문구 3"],
    topGeneralCandidates: ["보조 문구 1", "보조 문구 2", "보조 문구 3"],
  };
}

function createProviderResult(
  source: {
  videoPath: string;
  transcriptPath: string;
  channelName: string;
  originalTitle: string;
  },
  input?: {
    clipCount?: number;
    subtitleCandidateCount?: number;
  },
) {
  const clipCount = input?.clipCount ?? 10;
  const subtitleCandidateCount = input?.subtitleCandidateCount ?? 3;

  return {
    source,
    clips: Array.from({ length: clipCount }, (_, index) => ({
      ...createClip(index),
      topHighlightCandidates: Array.from(
        { length: subtitleCandidateCount },
        (_, candidateIndex) => `강조 문구 ${candidateIndex + 1}`,
      ),
      topGeneralCandidates: Array.from(
        { length: subtitleCandidateCount },
        (_, candidateIndex) => `보조 문구 ${candidateIndex + 1}`,
      ),
    })),
  };
}

describe("POST /api/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readTranscriptMock.mockImplementation(async (path: string) => {
      const { readFile } = await import("node:fs/promises");
      return readFile(path, "utf8");
    });
  });

  it("returns 400 for missing or invalid paths", async () => {
    const response = await POST(
      new Request("http://localhost/api/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoPath: "/tmp/does-not-exist-video.mp4",
          transcriptPath: "/tmp/does-not-exist-transcript.txt",
          channelName: "예시 채널",
          originalTitle: "원본 제목",
          provider: "codex",
          model: "gpt-5.4",
          settings: {
            clipCount: 10,
            minClipDurationSeconds: 30,
            maxClipDurationSeconds: 60,
            subtitleCandidateCount: 3,
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
    expect(planWithCodexMock).not.toHaveBeenCalled();
    expect(planWithOpenAIMock).not.toHaveBeenCalled();
  });

  it("returns 200 with a normalized plan for a valid mocked provider result", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-transcript-",
      "transcript.txt",
      "첫 줄\n둘째 줄",
    );
    planWithCodexMock.mockResolvedValue({
      output: createProviderResult({
        videoPath: "provider-overrode-video",
        transcriptPath: "provider-overrode-transcript",
        channelName: "provider-overrode-channel",
        originalTitle: "provider-overrode-title",
      }, {
        clipCount: 5,
        subtitleCandidateCount: 5,
      }),
      usage: {
        provider: "codex",
        model: "gpt-5.4",
        totalTokens: 123456,
        estimatedCostUsd: 0.54012,
        pricingReference: "https://openai.com/api/pricing",
        costMode: "rough_estimate",
        note: "GPT-5 API 단가와 입력 85% / 출력 15% 가정 기반 러프 추정치입니다.",
        reasoningEffort: "high",
        threadId: "thread-codex-001",
      },
    });

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: `  ${videoFixture.filePath}  `,
            transcriptPath: `\n${transcriptFixture.filePath}\t`,
            channelName: " 예시 채널 ",
            originalTitle: " 원본 제목 ",
            provider: "codex",
            model: "gpt-5.4-mini",
            settings: {
              clipCount: 5,
              minClipDurationSeconds: 15,
              maxClipDurationSeconds: 30,
              subtitleCandidateCount: 5,
            },
          }),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        planId: expect.any(String),
        source: {
          videoPath: videoFixture.filePath,
          transcriptPath: transcriptFixture.filePath,
          channelName: "예시 채널",
          originalTitle: "원본 제목",
        },
        settings: {
          clipCount: 5,
          minClipDurationSeconds: 15,
          maxClipDurationSeconds: 30,
          subtitleCandidateCount: 5,
        },
        usage: {
          provider: "codex",
          model: "gpt-5.4",
          totalTokens: 123456,
          estimatedCostUsd: 0.54012,
          costMode: "rough_estimate",
        },
        snapshot: {
          outputRootPath: expect.stringContaining(
            join(process.env.CAPCUT_AUTOMATION_DATA_ROOT!, "runs", "plans"),
          ),
          sessionDirectoryPath: expect.stringContaining(
            join(process.env.CAPCUT_AUTOMATION_DATA_ROOT!, "runs", "plans"),
          ),
          planFilePath: expect.stringContaining(
            join(process.env.CAPCUT_AUTOMATION_DATA_ROOT!, "runs", "plans"),
          ),
        },
        clips: Array.from({ length: 5 }, (_, index) =>
          expect.objectContaining({
            id: `short-${String(index + 1).padStart(3, "0")}`,
          }),
        ),
      });
      expect(planWithCodexMock).toHaveBeenCalledTimes(1);
      expect(planWithCodexMock).toHaveBeenCalledWith(
        expect.stringContaining("첫 줄\n둘째 줄"),
        "gpt-5.4-mini",
        expect.objectContaining({
          properties: expect.objectContaining({
            clips: expect.objectContaining({
              minItems: 5,
              maxItems: 5,
            }),
          }),
        }),
      );
      expect(planWithOpenAIMock).not.toHaveBeenCalled();
      const snapshotContent = JSON.parse(
        await readFile(body.snapshot.planFilePath, "utf8"),
      ) as {
        plan: unknown;
        model: string;
        outputRootPath: string;
      };
      expect(snapshotContent.model).toBe("gpt-5.4-mini");
      expect(snapshotContent.outputRootPath).toBe(
        join(process.env.CAPCUT_AUTOMATION_DATA_ROOT!, "runs", "plans"),
      );
      expect(snapshotContent.plan).toMatchObject({
        planId: body.planId,
        source: body.source,
        settings: body.settings,
        usage: body.usage,
      });
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });

  it("returns 502 when provider output fails planner schema validation", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-invalid-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-invalid-transcript-",
      "transcript.txt",
      "전사 내용",
    );
    planWithOpenAIMock.mockResolvedValue({
      output: {
        source: {
          videoPath: videoFixture.filePath,
          transcriptPath: transcriptFixture.filePath,
          channelName: "예시 채널",
          originalTitle: "원본 제목",
        },
        clips: Array.from({ length: 9 }, (_, index) => createClip(index)),
      },
    });

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: videoFixture.filePath,
            transcriptPath: transcriptFixture.filePath,
            channelName: "예시 채널",
            originalTitle: "원본 제목",
            provider: "openai",
            model: "gpt-5.4",
            openaiApiKey: "test-key",
            settings: {
              clipCount: 10,
              minClipDurationSeconds: 15,
              maxClipDurationSeconds: 30,
              subtitleCandidateCount: 3,
            },
          }),
        }),
      );

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_PROVIDER_OUTPUT",
        },
      });
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });

  it("trims overlong provider clips before validating the generated plan", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-overlong-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-overlong-transcript-",
      "transcript.txt",
      "전사 내용",
    );
    planWithCodexMock.mockResolvedValue({
      output: {
        ...createProviderResult({
          videoPath: videoFixture.filePath,
          transcriptPath: transcriptFixture.filePath,
          channelName: "예시 채널",
          originalTitle: "원본 제목",
        }, {
          clipCount: 5,
          subtitleCandidateCount: 3,
        }),
        clips: [
          {
            ...createClip(0),
            start: "00:01:00.000",
            end: "00:02:15.000",
          },
          ...Array.from({ length: 4 }, (_, index) => ({
            ...createClip(index + 1),
            start: formatTimecode(140 + index * 40),
            end: formatTimecode(170 + index * 40),
          })),
        ],
      },
    });

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: videoFixture.filePath,
            transcriptPath: transcriptFixture.filePath,
            channelName: "예시 채널",
            originalTitle: "원본 제목",
            provider: "codex",
            model: "gpt-5.4",
            settings: {
              clipCount: 5,
              minClipDurationSeconds: 30,
              maxClipDurationSeconds: 60,
              subtitleCandidateCount: 3,
            },
          }),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.clips[0]).toMatchObject({
        start: "00:01:00.000",
        end: "00:02:00.000",
      });
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });

  it("extends underlong provider clips before validating the generated plan", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-underlong-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-underlong-transcript-",
      "transcript.txt",
      "전사 내용",
    );
    planWithCodexMock.mockResolvedValue({
      output: {
        ...createProviderResult({
          videoPath: videoFixture.filePath,
          transcriptPath: transcriptFixture.filePath,
          channelName: "예시 채널",
          originalTitle: "원본 제목",
        }, {
          clipCount: 5,
          subtitleCandidateCount: 3,
        }),
        clips: [
          {
            ...createClip(0),
            start: "00:01:00.000",
            end: "00:01:15.000",
          },
          ...Array.from({ length: 4 }, (_, index) => ({
            ...createClip(index + 1),
            start: formatTimecode(140 + index * 40),
            end: formatTimecode(170 + index * 40),
          })),
        ],
      },
    });

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: videoFixture.filePath,
            transcriptPath: transcriptFixture.filePath,
            channelName: "예시 채널",
            originalTitle: "원본 제목",
            provider: "codex",
            model: "gpt-5.4",
            settings: {
              clipCount: 5,
              minClipDurationSeconds: 30,
              maxClipDurationSeconds: 60,
              subtitleCandidateCount: 3,
            },
          }),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.clips[0]).toMatchObject({
        start: "00:01:00.000",
        end: "00:01:30.000",
      });
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });

  it("returns route JSON error when transcript reading fails", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-read-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-read-transcript-",
      "transcript.txt",
      "전사 내용",
    );
    readTranscriptMock.mockRejectedValueOnce(new Error("Disk read failed"));

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: videoFixture.filePath,
            transcriptPath: transcriptFixture.filePath,
            channelName: "예시 채널",
            originalTitle: "원본 제목",
            provider: "codex",
            model: "gpt-5.4",
            settings: {
              clipCount: 10,
              minClipDurationSeconds: 30,
              maxClipDurationSeconds: 60,
              subtitleCandidateCount: 3,
            },
          }),
        }),
      );

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "TRANSCRIPT_READ_ERROR",
          message: "Disk read failed",
        },
      });
      expect(planWithCodexMock).not.toHaveBeenCalled();
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when required source fields are missing", async () => {
    const videoFixture = await createTempFile(
      "capcut-plan-invalid-output-video-",
      "video.mp4",
      "fake video content",
    );
    const transcriptFixture = await createTempFile(
      "capcut-plan-invalid-output-transcript-",
      "transcript.txt",
      "전사 내용",
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoPath: videoFixture.filePath,
            transcriptPath: transcriptFixture.filePath,
            channelName: "예시 채널",
            originalTitle: "",
            provider: "codex",
            model: "gpt-5.4",
            settings: {
              clipCount: 10,
              minClipDurationSeconds: 30,
              maxClipDurationSeconds: 60,
              subtitleCandidateCount: 3,
            },
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
          message: "originalTitle is required",
        },
      });
      expect(planWithCodexMock).not.toHaveBeenCalled();
    } finally {
      await rm(videoFixture.directory, { recursive: true, force: true });
      await rm(transcriptFixture.directory, { recursive: true, force: true });
    }
  });
});
