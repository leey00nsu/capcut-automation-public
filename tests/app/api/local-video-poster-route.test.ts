import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

const { extractVideoPosterMock } = vi.hoisted(() => ({
  extractVideoPosterMock: vi.fn(),
}));

vi.mock("@/lib/media/poster", () => ({
  extractVideoPoster: extractVideoPosterMock,
}));

const { GET } = await import("@/app/api/local-video/poster/route");

describe("GET /api/local-video/poster", () => {
  it("returns a jpeg poster for a valid request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-local-poster-"));
    const videoPath = join(directory, "source.mp4");
    extractVideoPosterMock.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    try {
      await writeFile(videoPath, Buffer.from("fake"));

      const response = await GET(
        new Request(
          `http://localhost/api/local-video/poster?path=${encodeURIComponent(videoPath)}&time=9.583`,
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(Buffer.from(await response.arrayBuffer())).toHaveLength(4);
      expect(extractVideoPosterMock).toHaveBeenCalledWith({
        videoPath,
        timeSeconds: 9.583,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
