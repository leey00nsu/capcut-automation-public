import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { openInFinderMock } = vi.hoisted(() => ({
  openInFinderMock: vi.fn(),
}));

vi.mock("@/lib/files/open-in-finder", () => ({
  openInFinder: openInFinderMock,
}));

const { POST } = await import("@/app/api/open-in-finder/route");

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function createTempFile(
  prefix: string,
  name: string,
  content: string,
): Promise<{ directory: string; filePath: string }> {
  const directory = await createTempDir(prefix);
  const filePath = join(directory, name);

  await writeFile(filePath, content, "utf8");

  return { directory, filePath };
}

describe("POST /api/open-in-finder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and triggers the helper for a valid directory request", async () => {
    const directory = await createTempDir("capcut-open-in-finder-dir-");

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: directory,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(openInFinderMock).toHaveBeenCalledTimes(1);
      expect(openInFinderMock).toHaveBeenCalledWith(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 200 and triggers the helper for a valid file request", async () => {
    const fixture = await createTempFile(
      "capcut-open-in-finder-file-",
      "video.mp4",
      "fake video content",
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: fixture.filePath,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(openInFinderMock).toHaveBeenCalledTimes(1);
      expect(openInFinderMock).toHaveBeenCalledWith(fixture.filePath);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/open-in-finder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });

  it("returns 400 for a nonexistent path", async () => {
    const response = await POST(
      new Request("http://localhost/api/open-in-finder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "/tmp/does-not-exist",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
    expect(openInFinderMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a path that is neither a file nor a directory", async () => {
    const fixture = await createTempFile(
      "capcut-open-in-finder-invalid-",
      "video.mp4",
      "fake video content",
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: `${fixture.filePath}/`,
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
        },
      });
      expect(openInFinderMock).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when the helper surfaces a path-related error after validation", async () => {
    const directory = await createTempDir("capcut-open-in-finder-race-");
    const error = new Error("no such file or directory") as Error & { code: string };
    error.code = "ENOENT";

    openInFinderMock.mockRejectedValueOnce(error);

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: directory,
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
        },
      });
      expect(openInFinderMock).toHaveBeenCalledTimes(1);
      expect(openInFinderMock).toHaveBeenCalledWith(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 400 when the helper surfaces its own plain path-type error after validation", async () => {
    const directory = await createTempDir("capcut-open-in-finder-path-type-");
    const error = new Error(
      `Path is not a file or directory: ${directory}`,
    );

    openInFinderMock.mockRejectedValueOnce(error);

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: directory,
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
        },
      });
      expect(openInFinderMock).toHaveBeenCalledTimes(1);
      expect(openInFinderMock).toHaveBeenCalledWith(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns 500 when the helper fails", async () => {
    const directory = await createTempDir("capcut-open-in-finder-error-");
    openInFinderMock.mockRejectedValueOnce(new Error("open failed"));

    try {
      const response = await POST(
        new Request("http://localhost/api/open-in-finder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: directory,
          }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "OPEN_IN_FINDER_ERROR",
          message: "open failed",
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
