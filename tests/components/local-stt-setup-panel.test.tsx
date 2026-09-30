import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalSttSetupPanel } from "@/components/local-stt-setup-panel";

afterEach(() => {
  cleanup();
});

describe("LocalSttSetupPanel", () => {
  it("shows install contents and sizes before confirming local stt install", () => {
    const onInstall = vi.fn();

    render(
      <LocalSttSetupPanel
        busy={false}
        onRefresh={vi.fn()}
        onInstall={onInstall}
        onRepair={vi.fn()}
        onUninstall={vi.fn()}
        status={{
          setup: {
            status: "not_installed",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 2 * 1024 * 1024 * 1024,
            selectedModelId: "mlx-community/whisper-medium",
            selectedModelLabel: "Balanced",
            components: [],
          },
          installPlan: {
            fingerprint: "plan-fingerprint",
            generatedAt: "2026-04-21T00:00:00.000Z",
            installRoot: "/tmp/local-stt",
            modelId: "mlx-community/whisper-medium",
            modelLabel: "Balanced",
            requiresNetwork: true,
            totalDownloadBytes: 120 * 1024 * 1024,
            totalInstallBytes: 512 * 1024 * 1024,
            freeDiskBytes: 2 * 1024 * 1024 * 1024,
            items: [
              {
                key: "ffmpeg",
                title: "Managed FFmpeg binary",
                version: "imageio-ffmpeg",
                purpose: "Audio extraction for transcription",
                sourceLabel: "PyPI",
                downloadBytes: 30 * 1024 * 1024,
                installBytes: 80 * 1024 * 1024,
                installPath: "/tmp/local-stt/cache/ffmpeg",
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "설치 항목 보기" }));

    expect(screen.getByText("Managed FFmpeg binary")).toBeInTheDocument();
    expect(screen.getByText(/총 다운로드/)).toBeInTheDocument();
    expect(screen.getByText(/설치 위치/)).toBeInTheDocument();
    expect(screen.getByText(/남은 디스크 공간/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "설치 시작" }));
    expect(onInstall).toHaveBeenCalledWith("plan-fingerprint");
  });

  it("disables install start while installation is already running", () => {
    render(
      <LocalSttSetupPanel
        busy={false}
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
        onRepair={vi.fn()}
        onUninstall={vi.fn()}
        status={{
          setup: {
            status: "installing",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 2 * 1024 * 1024 * 1024,
            selectedModelId: "mlx-community/whisper-medium",
            selectedModelLabel: "Balanced",
            components: [],
            currentOperation: {
              kind: "install",
              startedAt: "2026-04-21T00:00:00.000Z",
              stepKey: "download_model",
            },
          },
          installPlan: {
            fingerprint: "plan-fingerprint",
            generatedAt: "2026-04-21T00:00:00.000Z",
            installRoot: "/tmp/local-stt",
            modelId: "mlx-community/whisper-medium",
            modelLabel: "Balanced",
            requiresNetwork: true,
            totalDownloadBytes: 120 * 1024 * 1024,
            totalInstallBytes: 512 * 1024 * 1024,
            freeDiskBytes: 2 * 1024 * 1024 * 1024,
            items: [],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "설치 항목 보기" }));
    const installButtons = screen.getAllByRole("button", { name: "설치 시작" });
    expect(installButtons.at(-1)).toBeDisabled();
    expect(screen.getByText(/download_model/)).toBeInTheDocument();
  });
});
