import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { transcribeForSessionMock } = vi.hoisted(() => ({
  transcribeForSessionMock: vi.fn(),
}));

const { resolveLocalSttStatusMock, readLocalSttLockMock } = vi.hoisted(() => ({
  resolveLocalSttStatusMock: vi.fn(),
  readLocalSttLockMock: vi.fn(),
}));

vi.mock("@/lib/transcription/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transcription/service")>();

  return {
    ...actual,
    transcribeForSession: transcribeForSessionMock,
  };
});

vi.mock("@/lib/local-stt/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-stt/status")>();

  return {
    ...actual,
    resolveLocalSttStatus: resolveLocalSttStatusMock,
  };
});

vi.mock("@/lib/local-stt/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-stt/lock")>();

  return {
    ...actual,
    readLocalSttLock: readLocalSttLockMock,
  };
});

const { createPlanningSession, loadPlanningSession } = await import("@/lib/sessions/store");
const { POST } = await import("@/app/api/sessions/[sessionId]/transcribe/route");

const createdPaths: string[] = [];

afterEach(async () => {
  transcribeForSessionMock.mockReset();
  resolveLocalSttStatusMock.mockReset();
  readLocalSttLockMock.mockReset();
  await Promise.all(
    createdPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("POST /api/sessions/[sessionId]/transcribe", () => {
  it("rejects managed local stt when setup is not ready", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-transcribe-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);

    readLocalSttLockMock.mockResolvedValue(null);
    resolveLocalSttStatusMock.mockResolvedValue({
      setup: {
        status: "not_installed",
        supported: true,
        platform: {
          os: "darwin",
          arch: "arm64",
        },
        installRoot: "/tmp/local-stt",
        selectedModelId: "mlx-community/whisper-medium",
        selectedModelLabel: "Balanced",
        components: [],
      },
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcriptSource: {
            mode: "local_stt",
            engine: "mlx_whisper",
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
        code: "LOCAL_STT_NOT_READY",
      },
    });
    expect(transcribeForSessionMock).not.toHaveBeenCalled();
  });

  it("rejects managed local stt while install is active", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-transcribe-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);

    readLocalSttLockMock.mockResolvedValue({
      kind: "install",
      startedAt: "2026-04-21T00:00:00.000Z",
      stepKey: "bootstrap",
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcriptSource: {
            mode: "local_stt",
            engine: "mlx_whisper",
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
        code: "LOCAL_STT_BUSY",
      },
    });
    expect(transcribeForSessionMock).not.toHaveBeenCalled();
  });

  it("records a completed transcription job and latest transcript metadata", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-transcribe-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    const transcriptPath = join(tempDirectory, "input.txt");
    await writeFile(videoPath, "fake video", "utf8");
    await writeFile(transcriptPath, "[00:00:00.000 - 00:00:01.000] 첫 줄", "utf8");

    const session = await createPlanningSession({
      videoPath,
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    createdPaths.push(session.rootPath);

    transcribeForSessionMock.mockResolvedValue({
      mode: "manual_file",
      engine: "manual_file",
      artifactPaths: {
        transcriptPath: join(session.rootPath, "transcripts", "transcript.txt"),
        metadataPath: join(session.rootPath, "transcripts", "transcript.meta.json"),
        originalInputPath: transcriptPath,
      },
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.sessionId}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcriptSource: {
            mode: "manual_file",
            transcriptPath,
          },
        }),
      }),
      {
        params: Promise.resolve({
          sessionId: session.sessionId,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: session.sessionId,
      latestTranscription: {
        mode: "manual_file",
      },
      jobs: [
        expect.objectContaining({
          kind: "transcribe",
          status: "completed",
        }),
      ],
    });

    const persisted = await loadPlanningSession(session.sessionId);
    expect(persisted.jobs).toHaveLength(1);
    expect(persisted.latestTranscription?.artifactPaths.transcriptPath).toContain(
      "transcripts/transcript.txt",
    );
  });
});
