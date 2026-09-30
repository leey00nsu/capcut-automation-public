import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media/segment", () => ({
  getSegmentFilePath: vi.fn(),
}));

vi.mock("@/lib/files/paths", () => ({
  ensureReadableFilePath: vi.fn(async (value: string) => value),
}));

const { GET } = await import("@/app/api/local-video/segment/route");
const { getSegmentFilePath } = await import("@/lib/media/segment");

describe("GET /api/local-video/segment", () => {
  it("serves a clipped segment file for the requested time range", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-local-video-segment-"));
    const segmentPath = join(directory, "segment.mp4");

    try {
      await writeFile(segmentPath, Buffer.from("segment-data", "utf8"));
      vi.mocked(getSegmentFilePath).mockResolvedValueOnce(segmentPath);

      const response = await GET(
        new Request(
          "http://localhost/api/local-video/segment?path=%2Fvideos%2Fsource.mp4&start=69.366&end=96.800",
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("video/mp4");
      expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
        "segment-data",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when start or end are missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/local-video/segment?path=%2Fvideos%2Fsource.mp4"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });
});
