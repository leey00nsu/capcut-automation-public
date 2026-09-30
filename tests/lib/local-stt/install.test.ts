import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const createdDirectories: string[] = [];

const { resolveLocalSttStatusMock, installViaUvMock } = vi.hoisted(() => ({
  resolveLocalSttStatusMock: vi.fn(),
  installViaUvMock: vi.fn(),
}));

vi.mock("@/lib/local-stt/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-stt/status")>();

  return {
    ...actual,
    resolveLocalSttStatus: resolveLocalSttStatusMock,
  };
});

describe("installLocalStt", () => {
  afterEach(async () => {
    resolveLocalSttStatusMock.mockReset();
    installViaUvMock.mockReset();
    await Promise.all(
      createdDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("rejects install when the accepted fingerprint is stale", async () => {
    const { installLocalStt, LocalSttConflictError } = await import(
      "@/lib/local-stt/install"
    );

    resolveLocalSttStatusMock.mockResolvedValue({
      setup: {
        status: "not_installed",
        supported: true,
        platform: {
          os: "darwin",
          arch: "arm64",
        },
        installRoot: "/tmp/local-stt",
        selectedModelId: "mlx-community/whisper-medium",
        selectedModelLabel: "Balanced",
        components: [],
      },
      installPlan: {
        fingerprint: "current-fingerprint",
      },
    });

    await expect(
      installLocalStt(
        {
          acceptedPlanFingerprint: "stale-fingerprint",
        },
        {
          installViaUv: installViaUvMock,
        },
      ),
    ).rejects.toBeInstanceOf(LocalSttConflictError);
  });

  it("removes the managed runtime root during uninstall", async () => {
    const { uninstallLocalStt } = await import("@/lib/local-stt/install");
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-local-stt-install-"));
    createdDirectories.push(rootDirectory);
    await mkdir(join(rootDirectory, "runtime"), { recursive: true });
    resolveLocalSttStatusMock.mockResolvedValue({
      setup: {
        status: "not_installed",
        supported: true,
        platform: {
          os: "darwin",
          arch: "arm64",
        },
        installRoot: rootDirectory,
        selectedModelId: "mlx-community/whisper-medium",
        selectedModelLabel: "Balanced",
        components: [],
      },
    });

    const status = await uninstallLocalStt({
      installRoot: rootDirectory,
    });

    expect(status.setup.installRoot).toBe(rootDirectory);
    expect(status.setup.status).toBe("not_installed");
  });

  it("persists installer progress steps while installation is running", async () => {
    const { installLocalStt } = await import("@/lib/local-stt/install");
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-local-stt-install-"));
    createdDirectories.push(rootDirectory);

    resolveLocalSttStatusMock
      .mockResolvedValueOnce({
        setup: {
          status: "not_installed",
          supported: true,
          platform: {
            os: "darwin",
            arch: "arm64",
          },
          installRoot: rootDirectory,
          selectedModelId: "mlx-community/whisper-medium",
          selectedModelLabel: "Balanced",
          components: [],
        },
        installPlan: {
          fingerprint: "plan-fingerprint",
        },
      })
      .mockResolvedValueOnce({
        setup: {
          status: "ready",
          supported: true,
          platform: {
            os: "darwin",
            arch: "arm64",
          },
          installRoot: rootDirectory,
          selectedModelId: "mlx-community/whisper-medium",
          selectedModelLabel: "Balanced",
          components: [],
        },
      });

    await installLocalStt(
      {
        acceptedPlanFingerprint: "plan-fingerprint",
        installRoot: rootDirectory,
      },
      {
        installViaUv: async ({ onProgress }) => {
          await onProgress?.("download_model");
          const setup = JSON.parse(
            await readFile(join(rootDirectory, "setup.json"), "utf8"),
          ) as {
            currentOperation?: {
              stepKey: string;
            };
          };

          expect(setup.currentOperation?.stepKey).toBe("download_model");
        },
      },
    );
  });
});
