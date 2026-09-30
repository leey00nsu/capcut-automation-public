import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listRecentPlanSnapshots } from "@/lib/plans/snapshot";

const createdRoots: string[] = [];

function createClip(index: number) {
  return {
    id: `short-${String(index + 1).padStart(3, "0")}`,
    start: "00:00:00.000",
    end: "00:00:20.000",
    reason: "hook",
    topHighlightCandidates: ["강조 1", "강조 2", "강조 3"],
    topGeneralCandidates: ["본문 1", "본문 2", "본문 3"],
  };
}

async function writePlanSnapshot(input: {
  rootDirectory: string;
  sessionName: string;
  savedAt: string;
  originalTitle: string;
  nested?: boolean;
}) {
  const outputRootPath = join(input.rootDirectory, "runs", "plans");
  const sessionDirectoryPath = join(outputRootPath, input.sessionName);
  const plansDirectoryPath = input.nested
    ? join(sessionDirectoryPath, "plans")
    : sessionDirectoryPath;
  const planFilePath = join(plansDirectoryPath, "plan.json");

  await mkdir(plansDirectoryPath, { recursive: true });
  await writeFile(
    planFilePath,
    JSON.stringify(
      {
        savedAt: input.savedAt,
        provider: "codex",
        model: "gpt-5.5",
        outputRootPath,
        sessionDirectoryPath,
        plan: {
          planId: `plan-${input.sessionName}`,
          source: {
            videoPath: `/videos/${input.sessionName}.mp4`,
            transcriptPath: `/transcripts/${input.sessionName}.txt`,
            channelName: "예시 채널",
            originalTitle: input.originalTitle,
          },
          settings: {
            clipCount: 1,
            minClipDurationSeconds: 15,
            maxClipDurationSeconds: 30,
            subtitleCandidateCount: 3,
          },
          snapshot: {
            outputRootPath,
            sessionDirectoryPath,
            planFilePath,
          },
          clips: [createClip(0)],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return planFilePath;
}

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("listRecentPlanSnapshots", () => {
  it("returns valid legacy and session plan snapshots sorted by savedAt", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-recent-plans-"));
    createdRoots.push(rootDirectory);
    const olderPlanFilePath = await writePlanSnapshot({
      rootDirectory,
      sessionName: "older",
      savedAt: "2026-04-20T10:00:00.000Z",
      originalTitle: "오래된 후보",
    });
    const newerPlanFilePath = await writePlanSnapshot({
      rootDirectory,
      sessionName: "newer",
      savedAt: "2026-04-28T10:00:00.000Z",
      originalTitle: "최근 후보",
      nested: true,
    });
    await mkdir(join(rootDirectory, "runs", "plans", "broken"), { recursive: true });
    await writeFile(
      join(rootDirectory, "runs", "plans", "broken", "plan.json"),
      JSON.stringify({ nope: true }),
      "utf8",
    );

    const recentPlans = await listRecentPlanSnapshots({
      rootDirectory,
      limit: 10,
    });

    expect(recentPlans).toEqual([
      expect.objectContaining({
        savedAt: "2026-04-28T10:00:00.000Z",
        planFilePath: newerPlanFilePath,
        originalTitle: "최근 후보",
        clipCount: 1,
      }),
      expect.objectContaining({
        savedAt: "2026-04-20T10:00:00.000Z",
        planFilePath: olderPlanFilePath,
        originalTitle: "오래된 후보",
      }),
    ]);
  });

  it("respects the requested limit", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-recent-plans-"));
    createdRoots.push(rootDirectory);
    await writePlanSnapshot({
      rootDirectory,
      sessionName: "first",
      savedAt: "2026-04-28T10:00:00.000Z",
      originalTitle: "첫 번째",
    });
    await writePlanSnapshot({
      rootDirectory,
      sessionName: "second",
      savedAt: "2026-04-27T10:00:00.000Z",
      originalTitle: "두 번째",
    });

    await expect(
      listRecentPlanSnapshots({
        rootDirectory,
        limit: 1,
      }),
    ).resolves.toHaveLength(1);
  });
});
