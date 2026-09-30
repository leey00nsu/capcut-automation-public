import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, resolveLocalSttStatusMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  resolveLocalSttStatusMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();

  return {
    ...actual,
    execFile: execFileMock,
  };
});

vi.mock("@/lib/local-stt/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-stt/status")>();

  return {
    ...actual,
    resolveLocalSttStatus: resolveLocalSttStatusMock,
  };
});

describe("transcribeWithManagedMlx", () => {
  beforeEach(() => {
    resolveLocalSttStatusMock.mockResolvedValue({
      setup: {
        status: "ready",
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
    });
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        options:
          | {
              env?: NodeJS.ProcessEnv;
            }
          | ((error: Error | null, stdout: string, stderr: string) => void),
        callback?: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const done = typeof options === "function" ? options : callback;
        done?.(
          null,
          JSON.stringify({
            segments: [
              {
                text: "첫 줄",
                startSeconds: 0,
                endSeconds: 1.25,
              },
              {
                text: "둘째 줄",
                startSeconds: 1.25,
                endSeconds: 2.5,
              },
            ],
          }),
          "",
        );
      },
    );
  });

  afterEach(() => {
    resolveLocalSttStatusMock.mockReset();
    execFileMock.mockReset();
  });

  it("parses JSON transcript output from the managed python helper", async () => {
    const { transcribeWithManagedMlx } = await import(
      "@/lib/transcription/local-mlx"
    );

    const result = await transcribeWithManagedMlx({
      videoPath: "/videos/source.mp4",
      installRoot: "/tmp/local-stt",
    }, {
      processRunner: async (command, args, env) => {
        return await new Promise((resolve, reject) => {
          execFileMock(
            command,
            args,
            { env },
            (error: Error | null, stdout: string, stderr: string) => {
              if (error) {
                reject(error);
                return;
              }

              resolve({ stdout, stderr });
            },
          );
        });
      },
    });

    expect(result.summary.engine).toBe("mlx_whisper");
    expect(result.summary.model).toBe("mlx-community/whisper-medium");
    expect(result.transcriptText).toContain("[00:00:00.000 - 00:00:01.250] 첫 줄");
    expect(result.segments).toEqual([
      expect.objectContaining({
        id: "seg-001",
        start: "00:00:00.000",
        end: "00:00:01.250",
        text: "첫 줄",
      }),
      expect.objectContaining({
        id: "seg-002",
        start: "00:00:01.250",
        end: "00:00:02.500",
        text: "둘째 줄",
      }),
    ]);
    expect(execFileMock).toHaveBeenCalledWith(
      "/tmp/local-stt/runtime/venv/bin/python",
      expect.arrayContaining([
        expect.stringContaining("scripts/local-stt/mlx_transcribe.py"),
        "--video-path",
        "/videos/source.mp4",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({
          HF_HOME: expect.stringContaining("/tmp/local-stt/cache/huggingface"),
        }),
      }),
      expect.any(Function),
    );
  });

  it("rejects when managed local stt is not ready", async () => {
    resolveLocalSttStatusMock.mockResolvedValueOnce({
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
    });

    const { transcribeWithManagedMlx } = await import(
      "@/lib/transcription/local-mlx"
    );

    await expect(
      transcribeWithManagedMlx({
        videoPath: "/videos/source.mp4",
        installRoot: "/tmp/local-stt",
      }),
    ).rejects.toThrow("Managed local STT is not ready");
  });
});
