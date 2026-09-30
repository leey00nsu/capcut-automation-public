import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const { GET } = await import("@/app/api/local-video/route");

describe("GET /api/local-video", () => {
  it("returns partial content for a valid range request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-local-video-"));
    const videoPath = join(directory, "preview.mp4");

    try {
      await writeFile(videoPath, Buffer.from("0123456789", "utf8"));

      const response = await GET(
        new Request(
          `http://localhost/api/local-video?path=${encodeURIComponent(videoPath)}`,
          {
            headers: {
              Range: "bytes=2-5",
            },
          },
        ),
      );

      expect(response.status).toBe(206);
      expect(response.headers.get("Content-Type")).toBe("video/mp4");
      expect(response.headers.get("Accept-Ranges")).toBe("bytes");
      expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
      expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
        "2345",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when the path query is missing", async () => {
    const response = await GET(new Request("http://localhost/api/local-video"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });
});
