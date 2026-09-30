import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const { POST } = await import("@/app/api/plan/import/route");

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
    topHighlightCandidates: ["강조 1", "강조 2", "강조 3", "강조 4", "강조 5"],
    topGeneralCandidates: ["본문 1", "본문 2", "본문 3", "본문 4", "본문 5"],
  };
}

async function createPlanSnapshotFile() {
  const directory = await mkdtemp(join(tmpdir(), "capcut-plan-import-"));
  const planFilePath = join(directory, "plan.json");

  await writeFile(
    planFilePath,
    JSON.stringify(
      {
        savedAt: "2026-04-15T22:30:00.000Z",
        provider: "codex",
        model: "gpt-5.4-mini",
        channelImagePath: "/images/imported-channel.png",
        outputRootPath: directory,
        sessionDirectoryPath: directory,
        plan: {
          planId: "plan-001",
          source: {
            videoPath: "/videos/source.mp4",
            transcriptPath: "/transcripts/source.txt",
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
            pricingReference: "https://openai.com/api/pricing",
            costMode: "rough_estimate",
            note: "GPT-5 API 단가와 입력 85% / 출력 15% 가정 기반 러프 추정치입니다.",
            reasoningEffort: "high",
            threadId: "thread-codex-001",
          },
          snapshot: {
            outputRootPath: directory,
            sessionDirectoryPath: directory,
            planFilePath,
          },
          clips: Array.from({ length: 5 }, (_, index) => createClip(index)),
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return { directory, planFilePath };
}

describe("POST /api/plan/import", () => {
  it("returns a normalized plan from a saved plan snapshot", async () => {
    const fixture = await createPlanSnapshotFile();

    try {
      const response = await POST(
        new Request("http://localhost/api/plan/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planFilePath: fixture.planFilePath,
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        planId: "plan-001",
        source: {
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
          outputRootPath: fixture.directory,
          sessionDirectoryPath: fixture.directory,
          planFilePath: fixture.planFilePath,
        },
        importMetadata: {
          provider: "codex",
          model: "gpt-5.4-mini",
          channelImagePath: "/images/imported-channel.png",
        },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("returns 400 for an invalid snapshot file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-plan-import-"));
    const invalidPlanFilePath = join(directory, "plan.json");
    await writeFile(invalidPlanFilePath, JSON.stringify({ nope: true }), "utf8");

    try {
      const response = await POST(
        new Request("http://localhost/api/plan/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planFilePath: invalidPlanFilePath,
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("loads additive session and transcription metadata from newer snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-plan-import-"));
    const planFilePath = join(directory, "plans", "plan.json");
    await mkdir(join(directory, "plans"), { recursive: true });
    await writeFile(
      planFilePath,
      JSON.stringify(
        {
          savedAt: "2026-04-21T22:30:00.000Z",
          provider: "codex",
          model: "gpt-5.4-mini",
          outputRootPath: join(process.cwd(), "runs", "plans"),
          sessionDirectoryPath: directory,
          plan: {
            planId: "plan-002",
            sessionId: "session-002",
            source: {
              videoPath: "/videos/source.mp4",
              transcriptPath: "/runs/plans/session-002/transcripts/transcript.txt",
              channelName: "예시 채널",
              originalTitle: "원본 제목",
            },
            settings: {
              clipCount: 5,
              minClipDurationSeconds: 15,
              maxClipDurationSeconds: 30,
              subtitleCandidateCount: 5,
            },
            transcription: {
              mode: "manual_file",
              engine: "manual_file",
              artifactPaths: {
                transcriptPath:
                  "/runs/plans/session-002/transcripts/transcript.txt",
                metadataPath:
                  "/runs/plans/session-002/transcripts/transcript.meta.json",
              },
            },
            snapshot: {
              outputRootPath: join(process.cwd(), "runs", "plans"),
              sessionDirectoryPath: directory,
              planFilePath,
            },
            clips: Array.from({ length: 5 }, (_, index) => createClip(index)),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/plan/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planFilePath,
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        planId: "plan-002",
        sessionId: "session-002",
        transcription: {
          mode: "manual_file",
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
