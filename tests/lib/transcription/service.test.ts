import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  extractTranscriptionAudioMock,
  transcribeWithLocalWhisperMock,
  transcribeWithManagedMlxMock,
} = vi.hoisted(() => ({
  extractTranscriptionAudioMock: vi.fn(),
  transcribeWithLocalWhisperMock: vi.fn(),
  transcribeWithManagedMlxMock: vi.fn(),
}));

vi.mock("@/lib/transcription/audio", () => ({
  extractTranscriptionAudio: extractTranscriptionAudioMock,
}));

vi.mock("@/lib/transcription/local-whisper", () => ({
  transcribeWithLocalWhisper: transcribeWithLocalWhisperMock,
}));

vi.mock("@/lib/transcription/local-mlx", () => ({
  transcribeWithManagedMlx: transcribeWithManagedMlxMock,
}));

const { createPlanningSession } = await import("@/lib/sessions/store");
const { transcribeForSession } = await import("@/lib/transcription/service");

const createdRoots: string[] = [];

describe("transcribeForSession", () => {
  beforeEach(() => {
    extractTranscriptionAudioMock.mockReset();
    transcribeWithLocalWhisperMock.mockReset();
    transcribeWithManagedMlxMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.unstubAllGlobals();
  });

  it("copies a manual transcript into the session transcript artifacts", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-transcribe-service-"));
    createdRoots.push(rootDirectory);
    const session = await createPlanningSession({
      rootDirectory,
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });
    const transcriptPath = join(rootDirectory, "manual-input.txt");
    await writeFile(
      transcriptPath,
      "[00:00:00.000 - 00:00:01.000] 첫 줄\n[00:00:01.000 - 00:00:02.000] 둘째 줄",
      "utf8",
    );

    const summary = await transcribeForSession({
      session,
      source: {
        mode: "manual_file",
        transcriptPath,
      },
    });

    expect(summary.mode).toBe("manual_file");
    expect(summary.artifactPaths.originalInputPath).toBe(transcriptPath);
    await expect(readFile(summary.artifactPaths.transcriptPath, "utf8")).resolves.toContain(
      "첫 줄",
    );
  });

  it("runs managed MLX transcription and writes normalized artifacts for local STT", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-transcribe-service-"));
    createdRoots.push(rootDirectory);
    const session = await createPlanningSession({
      rootDirectory,
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });

    transcribeWithManagedMlxMock.mockResolvedValue({
      transcriptText:
        "[00:00:00.000 - 00:00:01.250] 첫 번째 문장\n[00:00:01.250 - 00:00:02.500] 둘째 문장",
      segments: [
        {
          id: "seg-001",
          start: "00:00:00.000",
          end: "00:00:01.250",
          text: "첫 번째 문장",
        },
        {
          id: "seg-002",
          start: "00:00:01.250",
          end: "00:00:02.500",
          text: "둘째 문장",
        },
      ],
      summary: {
        mode: "local_stt",
        engine: "mlx_whisper",
        model: "mlx-community/whisper-medium",
        language: "ko",
      },
    });

    const summary = await transcribeForSession({
      session,
      source: {
        mode: "local_stt",
        engine: "mlx_whisper",
        modelId: "mlx-community/whisper-medium",
        language: "ko",
      },
    });

    const transcriptText = await readFile(summary.artifactPaths.transcriptPath, "utf8");
    const segmentsRaw = await readFile(summary.artifactPaths.segmentsPath ?? "", "utf8");

    expect(extractTranscriptionAudioMock).not.toHaveBeenCalled();
    expect(transcribeWithManagedMlxMock).toHaveBeenCalledWith({
      videoPath: "/videos/source.mp4",
      modelId: "mlx-community/whisper-medium",
      language: "ko",
    });
    expect(summary.engine).toBe("mlx_whisper");
    expect(transcriptText).toContain("[00:00:00.000 - 00:00:01.250] 첫 번째 문장");
    await expect(JSON.parse(segmentsRaw)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: "00:00:00.000",
          end: "00:00:01.250",
          text: "첫 번째 문장",
        }),
      ]),
    );
  });

  it("keeps the legacy whisper.cpp path working for persisted sessions", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "capcut-transcribe-service-"));
    createdRoots.push(rootDirectory);
    const session = await createPlanningSession({
      rootDirectory,
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    });

    transcribeWithLocalWhisperMock.mockResolvedValue({
      transcriptText: "[00:00:00.000 - 00:00:01.000] 첫 줄",
      segments: [
        {
          id: "seg-001",
          start: "00:00:00.000",
          end: "00:00:01.000",
          text: "첫 줄",
        },
      ],
      summary: {
        mode: "local_stt",
        engine: "whisper_cpp",
        model: "/models/ggml-base.bin",
      },
    });

    const summary = await transcribeForSession({
      session,
      source: {
        mode: "local_stt",
        engine: "whisper_cpp",
        modelPath: "/models/ggml-base.bin",
      },
    });

    expect(extractTranscriptionAudioMock).toHaveBeenCalledOnce();
    expect(transcribeWithLocalWhisperMock).toHaveBeenCalledOnce();
    expect(summary.engine).toBe("whisper_cpp");
  });
});
