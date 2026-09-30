import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const { GET } = await import("@/app/api/local-image/route");

describe("GET /api/local-image", () => {
  it("returns image bytes for a valid local image path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-local-image-"));
    const imagePath = join(directory, "profile.jpg");

    try {
      await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const response = await GET(
        new Request(
          `http://localhost/api/local-image?path=${encodeURIComponent(imagePath)}`,
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect((await response.arrayBuffer()).byteLength).toBe(4);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when the path query is missing", async () => {
    const response = await GET(new Request("http://localhost/api/local-image"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });
});
