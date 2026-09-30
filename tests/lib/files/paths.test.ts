import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ensureExistingDirectoryPath,
  ensureReadableFilePath,
} from "@/lib/files/paths";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("path helpers", () => {
  it("rejects whitespace-only input", async () => {
    await expect(ensureReadableFilePath("   ")).rejects.toThrow(
      "file path is required",
    );
    await expect(ensureExistingDirectoryPath("\n\t ")).rejects.toThrow(
      "directory path is required",
    );
  });

  it("rejects missing paths", async () => {
    await expect(
      ensureReadableFilePath("/tmp/does-not-exist-capcut-file.txt"),
    ).rejects.toThrow(/file path does not exist:/);
    await expect(
      ensureExistingDirectoryPath("/tmp/does-not-exist-capcut-dir"),
    ).rejects.toThrow(/directory path does not exist:/);
  });

  it("rejects wrong-type paths", async () => {
    const directory = await createTempDir("capcut-path-dir-");
    const fileDirectory = await createTempDir("capcut-path-file-parent-");
    const filePath = join(fileDirectory, "sample.txt");
    await writeFile(filePath, "hello", "utf8");

    try {
      await expect(ensureReadableFilePath(directory)).rejects.toThrow(
        /is not a file:/,
      );
      await expect(ensureExistingDirectoryPath(filePath)).rejects.toThrow(
        /is not a directory:/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(fileDirectory, { recursive: true, force: true });
    }
  });

  it("rejects unreadable files", async () => {
    const directory = await createTempDir("capcut-path-unreadable-");
    const filePath = join(directory, "sample.txt");
    await writeFile(filePath, "secret", "utf8");

    try {
      await chmod(filePath, 0o000);
      await expect(ensureReadableFilePath(filePath)).rejects.toThrow(
        /is not readable or accessible:/,
      );
    } finally {
      await chmod(filePath, 0o600).catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns normalized paths for readable files and directories", async () => {
    const directory = await createTempDir("capcut-path-ok-");
    const filePath = join(directory, "sample.txt");
    await writeFile(filePath, "hello", "utf8");

    try {
      await expect(
        ensureReadableFilePath(`  ${filePath}  `),
      ).resolves.toBe(filePath);
      await expect(
        ensureExistingDirectoryPath(`\n${directory}\t`),
      ).resolves.toBe(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
