import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const createdDirectories: string[] = [];

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();

  return {
    ...actual,
    execFile: execFileMock,
  };
});

const { resolveLocalSttStatus } = await import("@/lib/local-stt/status");
const { writeLocalSttSetupState } = await import("@/lib/local-stt/store");
const {
  getLocalSttMarkersDirectoryPath,
  getLocalSttLockPath,
  getLocalSttUvExecutablePath,
  getLocalSttVenvPythonPath,
} = await import("@/lib/local-stt/paths");

describe("resolveLocalSttStatus", () => {
  afterEach(async () => {
    execFileMock.mockReset();
    await Promise.all(
      createdDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("marks unsupported platforms before exposing install actions", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-local-stt-"));
    createdDirectories.push(rootDirectory);

    const status = await resolveLocalSttStatus({
      installRoot: rootDirectory,
      platform: {
        os: "linux",
        arch: "x64",
      },
    });

    expect(status.setup.status).toBe("unsupported");
    expect(status.installPlan).toBeUndefined();
    expect(status.setup.platform.reason).toContain("macOS");
  });

  it("rebuilds the install plan and partial state from setup.json", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-local-stt-"));
    createdDirectories.push(rootDirectory);
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s1 1000 100 900 10% 1 1 0% /", "");
      },
    );

    await mkdir(join(rootDirectory, "runtime", "uv"), { recursive: true });
    await mkdir(join(rootDirectory, "runtime", "venv", "bin"), { recursive: true });
    await mkdir(getLocalSttMarkersDirectoryPath(rootDirectory), { recursive: true });
    await mkdir(getLocalSttUvExecutablePath(rootDirectory), { recursive: true });
    await mkdir(join(getLocalSttVenvPythonPath(rootDirectory), ".."), {
      recursive: true,
    });
    await mkdir(join(rootDirectory, ".markers"), { recursive: true });
    await writeFile(
      getLocalSttLockPath(rootDirectory),
      JSON.stringify({
        kind: "install",
        startedAt: "2026-04-21T00:00:00.000Z",
        stepKey: "default_model",
      }),
      "utf8",
    );

    await writeLocalSttSetupState({
      status: "partial",
      supported: true,
      platform: {
        os: "darwin",
        arch: "arm64",
      },
      installRoot: rootDirectory,
      selectedModelId: "mlx-community/whisper-medium",
      selectedModelLabel: "Balanced",
      freeDiskBytes: 900 * 1024,
      components: [],
      currentOperation: {
        kind: "install",
        startedAt: "2026-04-21T00:00:00.000Z",
        stepKey: "default_model",
      },
    });

    const status = await resolveLocalSttStatus({
      installRoot: rootDirectory,
      platform: {
        os: "darwin",
        arch: "arm64",
      },
      generatedAt: "2026-04-21T00:00:01.000Z",
    });

    expect(status.setup.status).toBe("installing");
    expect(status.installPlan?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(status.installPlan?.generatedAt).toBe("2026-04-21T00:00:01.000Z");
  });

  it("downgrades stale installing state when setup json exists without a lock", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-local-stt-"));
    createdDirectories.push(rootDirectory);
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(
          null,
          "Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s1 1000 100 900 10% 1 1 0% /",
          "",
        );
      },
    );

    await writeLocalSttSetupState({
      status: "installing",
      supported: true,
      platform: {
        os: "darwin",
        arch: "arm64",
      },
      installRoot: rootDirectory,
      selectedModelId: "mlx-community/whisper-medium",
      selectedModelLabel: "Balanced",
      freeDiskBytes: 900 * 1024,
      components: [],
      currentOperation: {
        kind: "install",
        startedAt: "2026-04-21T00:00:00.000Z",
        stepKey: "bootstrap",
      },
    });

    const status = await resolveLocalSttStatus({
      installRoot: rootDirectory,
      platform: {
        os: "darwin",
        arch: "arm64",
      },
    });

    expect(status.setup.status).toBe("failed");
    expect(status.setup.currentOperation).toBeUndefined();
    expect(status.setup.lastError).toContain("중단");
  });
});
