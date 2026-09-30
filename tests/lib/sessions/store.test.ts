import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  PlanningSession,
  TranscriptSegment,
  TranscriptionSummary,
} from "@/types/session";
import {
  createPlanningSession,
  getPlanningSessionDirectoryPath,
  getPlanningSessionFilePath,
  loadPlanningSession,
  writePlanningSession,
} from "@/lib/sessions/store";

const createdRoots: string[] = [];

function createCompletedTranscriptionSummary(
  transcriptPath: string,
): TranscriptionSummary {
  const segments: TranscriptSegment[] = [
    {
      id: "seg-001",
      start: "00:00:00.000",
      end: "00:00:02.500",
      text: "첫 번째 문장",
    },
  ];

  return {
    mode: "manual_file",
    engine: "manual_file",
    artifactPaths: {
      transcriptPath,
      segmentsPath: `${transcriptPath}.segments.json`,
      metadataPath: `${transcriptPath}.meta.json`,
      originalInputPath: "/Users/test/input.txt",
    },
    segments,
  };
}

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("planning session store", () => {
  it("creates a persisted session under runs/plans with a readable id", async () => {
    const rootDirectory = await import("node:fs/promises").then(({ mkdtemp }) =>
      mkdtemp(join(tmpdir(), "capcut-session-store-")),
    );
    createdRoots.push(rootDirectory);

    const session = await createPlanningSession({
      rootDirectory,
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      channelImagePath: "/images/channel.png",
      originalTitle: "원본 제목",
    });

    const sessionDirectoryPath = getPlanningSessionDirectoryPath(
      session.sessionId,
      rootDirectory,
    );
    const sessionFilePath = getPlanningSessionFilePath(
      session.sessionId,
      rootDirectory,
    );
    const persistedRaw = await readFile(sessionFilePath, "utf8");

    expect(session.sessionId).toBe(basename(sessionDirectoryPath));
    expect(session.rootPath).toBe(sessionDirectoryPath);
    expect(session.jobs).toEqual([]);
    expect(JSON.parse(persistedRaw)).toMatchObject({
      sessionId: session.sessionId,
      source: {
        videoPath: "/videos/source.mp4",
        channelName: "예시 채널",
        originalTitle: "원본 제목",
        channelImagePath: "/images/channel.png",
      },
    });
    await expect(access(sessionDirectoryPath)).resolves.toBeUndefined();
  });

  it("round-trips updated jobs and transcription metadata", async () => {
    const rootDirectory = await import("node:fs/promises").then(({ mkdtemp }) =>
      mkdtemp(join(tmpdir(), "capcut-session-store-")),
    );
    createdRoots.push(rootDirectory);

    const session = await createPlanningSession({
      rootDirectory,
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    const transcriptPath = join(session.rootPath, "transcripts", "transcript.txt");
    const updated: PlanningSession = {
      ...session,
      jobs: [
        {
          id: "job-transcribe-001",
          kind: "transcribe",
          status: "completed",
          createdAt: "2026-04-21T12:00:00.000Z",
          updatedAt: "2026-04-21T12:00:03.000Z",
          completedAt: "2026-04-21T12:00:03.000Z",
          input: {
            mode: "manual_file",
            transcriptPath: "/Users/test/input.txt",
          },
          result: createCompletedTranscriptionSummary(transcriptPath),
        },
      ],
      latestTranscription: createCompletedTranscriptionSummary(transcriptPath),
    };

    await writePlanningSession(updated);

    const reloaded = await loadPlanningSession(session.sessionId, rootDirectory);

    expect(reloaded).toMatchObject({
      sessionId: session.sessionId,
      latestTranscription: {
        artifactPaths: {
          transcriptPath,
        },
      },
      jobs: [
        {
          id: "job-transcribe-001",
          kind: "transcribe",
          status: "completed",
        },
      ],
    });
  });
});
