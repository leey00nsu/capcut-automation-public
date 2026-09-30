import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const { GET } = await import("@/app/api/local-font/route");

describe("GET /api/local-font", () => {
  it("serves the bundled font for the default template preview", async () => {
    const response = await GET(new Request("http://localhost/api/local-font?template=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("font/otf");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("OTTO");
  });
  it("returns font bytes for a valid local font path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capcut-local-font-"));
    const fontPath = join(directory, "template.otf");

    try {
      await writeFile(fontPath, Buffer.from("OTTO", "utf8"));

      const response = await GET(
        new Request(
          `http://localhost/api/local-font?path=${encodeURIComponent(fontPath)}`,
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("font/otf");
      expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
        "OTTO",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
