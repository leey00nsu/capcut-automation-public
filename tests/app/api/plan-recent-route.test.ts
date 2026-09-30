import { describe, expect, it, vi } from "vitest";

const { listRecentPlanSnapshotsMock } = vi.hoisted(() => ({
  listRecentPlanSnapshotsMock: vi.fn(),
}));

vi.mock("@/lib/plans/snapshot", () => ({
  listRecentPlanSnapshots: listRecentPlanSnapshotsMock,
}));

const { GET } = await import("@/app/api/plan/recent/route");

describe("GET /api/plan/recent", () => {
  it("returns recent completed plan snapshots", async () => {
    listRecentPlanSnapshotsMock.mockResolvedValue([
      {
        savedAt: "2026-04-28T04:00:00.000Z",
        planFilePath: "/runs/plans/recent/plans/plan.json",
        sessionDirectoryPath: "/runs/plans/recent",
        planId: "plan-recent",
        originalTitle: "최근 후보",
        channelName: "예시 채널",
        videoPath: "/videos/recent.mp4",
        clipCount: 5,
        provider: "codex",
        model: "gpt-5.5",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/plan/recent?limit=6"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plans: [
        expect.objectContaining({
          planFilePath: "/runs/plans/recent/plans/plan.json",
          originalTitle: "최근 후보",
        }),
      ],
    });
    expect(listRecentPlanSnapshotsMock).toHaveBeenCalledWith({ limit: 6 });
  });
});
