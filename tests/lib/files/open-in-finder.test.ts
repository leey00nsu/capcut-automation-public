import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(async () => undefined),
}));

const { openInFinder } = await import("@/lib/files/open-in-finder");

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

describe("openInFinder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens directories directly in Finder", async () => {
    const directory = await createTempDir("capcut-open-in-finder-dir-");

    try {
      await openInFinder(directory, execFileMock);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith("open", [directory]);
  });

  it("reveals and selects files in Finder", async () => {
    const fixture = await createTempFile(
      "capcut-open-in-finder-file-",
      "video.mp4",
      "fake video content",
    );

    try {
      await openInFinder(fixture.filePath, execFileMock);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith("open", ["-R", fixture.filePath]);
  });
});
