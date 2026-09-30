import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { planWithCodexMock, planWithOpenAIMock } = vi.hoisted(() => ({
  planWithCodexMock: vi.fn(),
  planWithOpenAIMock: vi.fn(),
}));

vi.mock("@/lib/ai/codex", () => ({
  planWithCodex: planWithCodexMock,
}));

vi.mock("@/lib/ai/openai", () => ({
  planWithOpenAI: planWithOpenAIMock,
}));

const { createPlanningSession, writePlanningSession } = await import("@/lib/sessions/store");
const { POST } = await import("@/app/api/sessions/[sessionId]/plan/route");

const createdPaths: string[] = [];

function createProviderResult() {
  function formatTimecode(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000`;
  }

  return {
    source: {
      videoPath: "/videos/source.mp4",
      transcriptPath: "/sessions/transcripts/transcript.txt",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    },
    clips: Array.from({ length: 5 }, (_, index) => ({
      id: `short-${String(index + 1).padStart(3, "0")}`,
      start: formatTimecode(index * 10),
      end: formatTimecode(index * 10 + 20),
      reason: "hook",
      topHighlightCandidates: ["강조 1", "강조 2", "강조 3"],
      topGeneralCandidates: ["본문 1", "본문 2", "본문 3"],
    })),
  };
}

afterEach(async () => {
  planWithCodexMock.mockReset();
  planWithOpenAIMock.mockReset();
  await Promise.all(
    createdPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("POST /api/sessions/[sessionId]/plan", () => {
  it("plans from the latest session transcript and saves a session-linked snapshot", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-plan-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);
    const transcriptPath = join(session.rootPath, "transcripts", "transcript.txt");
    await writeFile(transcriptPath, "[00:00:00.000 - 00:00:02.000] 첫 줄", "utf8");
    await writePlanningSession({
      ...session,
      latestTranscription: {
        mode: "manual_file",
        engine: "manual_file",
        artifactPaths: {
          transcriptPath,
          metadataPath: join(session.rootPath, "transcripts", "transcript.meta.json"),
        },
      },
    });

    planWithCodexMock.mockResolvedValue({
      output: createProviderResult(),
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "codex",
          model: "gpt-custom-planner",
          promptInstructions: "반전이 있는 대화를 우선해서 골라라.",
          settings: {
            clipCount: 5,
            minClipDurationSeconds: 15,
            maxClipDurationSeconds: 30,
            subtitleCandidateCount: 3,
          },
        }),
      }),
      {
        params: Promise.resolve({
          sessionId: session.sessionId,
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(planWithCodexMock).toHaveBeenCalledWith(
      expect.stringContaining("반전이 있는 대화를 우선해서 골라라."),
      "gpt-custom-planner",
      expect.any(Object),
    );
    expect(String(planWithCodexMock.mock.calls[0]?.[0])).toContain(
      "반드시 JSON만 출력",
    );
    expect(body).toMatchObject({
      sessionId: session.sessionId,
      source: {
        videoPath,
        transcriptPath,
        channelName: "예시 채널",
        originalTitle: "원본 제목",
      },
      transcription: {
        mode: "manual_file",
      },
      snapshot: {
        planFilePath: join(session.rootPath, "plans", "plan.json"),
      },
    });
  });

  it("trims overlong provider clips before saving a session plan", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-plan-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);
    const transcriptPath = join(session.rootPath, "transcripts", "transcript.txt");
    await writeFile(transcriptPath, "[00:00:00.000 - 00:00:02.000] 첫 줄", "utf8");
    await writePlanningSession({
      ...session,
      latestTranscription: {
        mode: "manual_file",
        engine: "manual_file",
        artifactPaths: {
          transcriptPath,
          metadataPath: join(session.rootPath, "transcripts", "transcript.meta.json"),
        },
      },
    });

    const providerResult = createProviderResult();
    planWithCodexMock.mockResolvedValue({
      output: {
        ...providerResult,
        clips: [
          {
            ...providerResult.clips[0],
            start: "00:01:00.000",
            end: "00:02:15.000",
          },
          ...providerResult.clips.slice(1).map((clip, index) => ({
            ...clip,
            start: `00:0${2 + index}:20.000`,
            end: `00:0${2 + index}:50.000`,
          })),
        ],
      },
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "codex",
          model: "gpt-5.5",
          settings: {
            clipCount: 5,
            minClipDurationSeconds: 30,
            maxClipDurationSeconds: 60,
            subtitleCandidateCount: 3,
          },
        }),
      }),
      {
        params: Promise.resolve({
          sessionId: session.sessionId,
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clips[0]).toMatchObject({
      start: "00:01:00.000",
      end: "00:02:00.000",
    });
  });

  it("extends underlong provider clips before saving a session plan", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-plan-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);
    const transcriptPath = join(session.rootPath, "transcripts", "transcript.txt");
    await writeFile(transcriptPath, "[00:00:00.000 - 00:00:02.000] 첫 줄", "utf8");
    await writePlanningSession({
      ...session,
      latestTranscription: {
        mode: "manual_file",
        engine: "manual_file",
        artifactPaths: {
          transcriptPath,
          metadataPath: join(session.rootPath, "transcripts", "transcript.meta.json"),
        },
      },
    });

    const providerResult = createProviderResult();
    planWithCodexMock.mockResolvedValue({
      output: {
        ...providerResult,
        clips: [
          {
            ...providerResult.clips[0],
            start: "00:01:00.000",
            end: "00:01:15.000",
          },
          ...providerResult.clips.slice(1).map((clip, index) => ({
            ...clip,
            start: `00:0${2 + index}:20.000`,
            end: `00:0${2 + index}:50.000`,
          })),
        ],
      },
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "codex",
          model: "gpt-5.5",
          settings: {
            clipCount: 5,
            minClipDurationSeconds: 30,
            maxClipDurationSeconds: 60,
            subtitleCandidateCount: 3,
          },
        }),
      }),
      {
        params: Promise.resolve({
          sessionId: session.sessionId,
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clips[0]).toMatchObject({
      start: "00:01:00.000",
      end: "00:01:30.000",
    });
  });

  it("rejects planning when no completed transcription exists", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-plan-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "codex",
          model: "gpt-5.5",
          settings: {
            clipCount: 5,
            minClipDurationSeconds: 15,
            maxClipDurationSeconds: 30,
            subtitleCandidateCount: 3,
          },
        }),
      }),
      {
        params: Promise.resolve({
          sessionId: session.sessionId,
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_STATE",
      },
    });
  });
});
