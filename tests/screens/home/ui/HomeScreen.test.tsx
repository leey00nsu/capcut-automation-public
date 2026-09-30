import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HomeScreen,
  coercePlannerFormValues,
} from "@/screens/home/ui/HomeScreen";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function fillBaseFields() {
  fireEvent.change(screen.getByLabelText("Video path"), {
    target: { value: "/videos/source.mp4" },
  });
  fireEvent.change(screen.getByLabelText("Transcript path"), {
    target: { value: "/transcripts/source.txt" },
  });
  fireEvent.change(screen.getByLabelText("Channel name"), {
    target: { value: "예시 채널" },
  });
  fireEvent.change(screen.getByLabelText("Original title"), {
    target: { value: "원본 제목" },
  });
}

function openAdvancedSettings() {
  fireEvent.click(screen.getByRole("button", { name: "설정 펼치기" }));
}

function buildPlanResponse(overrides?: Record<string, unknown>) {
  return {
    planId: "plan-001",
    sessionId: "원본 제목_20260421_010203",
    source: {
      videoPath: "/videos/source.mp4",
      transcriptPath: "/app/runs/plans/원본 제목_20260421_010203/transcripts/transcript.txt",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    },
    transcription: {
      mode: "manual_file",
      engine: "manual_file",
      artifactPaths: {
        transcriptPath:
          "/app/runs/plans/원본 제목_20260421_010203/transcripts/transcript.txt",
        metadataPath:
          "/app/runs/plans/원본 제목_20260421_010203/transcripts/transcript.meta.json",
        originalInputPath: "/transcripts/source.txt",
      },
    },
    settings: {
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 5,
    },
    usage: {
      provider: "codex",
      model: "gpt-5.5",
      totalTokens: 123456,
      estimatedCostUsd: 1.08024,
      pricingReference: "https://openai.com/api/pricing",
      costMode: "rough_estimate",
      note: "선택된 GPT-5 계열 API 단가와 입력 85% / 출력 15% 가정 기반 러프 추정치입니다.",
      reasoningEffort: "high",
      threadId: "thread-codex-001",
    },
    snapshot: {
      outputRootPath: "/app/runs/plans",
      sessionDirectoryPath: "/app/runs/plans/원본 제목_20260421_010203",
      planFilePath: "/app/runs/plans/원본 제목_20260421_010203/plans/plan.json",
    },
    clips: [
      {
        id: "short-001",
        start: "00:01:09.366",
        end: "00:01:29.800",
        reason: "hook",
        topHighlightCandidates: ["강조 1", "강조 1-2", "강조 1-3", "강조 1-4", "강조 1-5"],
        topGeneralCandidates: ["본문 1", "본문 1-2", "본문 1-3", "본문 1-4", "본문 1-5"],
      },
      {
        id: "short-001",
        start: "00:02:10.000",
        end: "00:02:35.500",
        reason: "hook",
        topHighlightCandidates: ["강조 2", "강조 2-2", "강조 2-3", "강조 2-4", "강조 2-5"],
        topGeneralCandidates: ["본문 2", "본문 2-2", "본문 2-3", "본문 2-4", "본문 2-5"],
      },
    ],
    ...overrides,
  };
}

describe("HomeScreen", () => {
  const fetchMock = vi.fn();
  const defaultEncodedSessionId = encodeURIComponent("원본 제목_20260421_010203");

  beforeEach(() => {
    window.localStorage.clear();
    let localSttInstalled = false;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();

      if (url.endsWith("/api/local-stt/status")) {
        return jsonResponse({
          setup: {
            status: localSttInstalled ? "ready" : "not_installed",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 4 * 1024 * 1024 * 1024,
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
            freeDiskBytes: 4 * 1024 * 1024 * 1024,
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
        });
      }

      if (url.endsWith("/api/local-stt/install")) {
        localSttInstalled = true;

        return jsonResponse({
          setup: {
            status: "ready",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 4 * 1024 * 1024 * 1024,
            selectedModelId: "mlx-community/whisper-medium",
            selectedModelLabel: "Balanced",
            components: [],
          },
        });
      }

      if (url.endsWith("/api/local-stt/repair")) {
        localSttInstalled = true;

        return jsonResponse({
          setup: {
            status: "ready",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 4 * 1024 * 1024 * 1024,
            selectedModelId: "mlx-community/whisper-medium",
            selectedModelLabel: "Balanced",
            components: [],
          },
        });
      }

      if (url.endsWith("/api/local-stt/uninstall")) {
        localSttInstalled = false;

        return jsonResponse({
          setup: {
            status: "not_installed",
            supported: true,
            platform: {
              os: "darwin",
              arch: "arm64",
            },
            installRoot: "/tmp/local-stt",
            freeDiskBytes: 4 * 1024 * 1024 * 1024,
            selectedModelId: "mlx-community/whisper-medium",
            selectedModelLabel: "Balanced",
            components: [],
          },
        });
      }

      if (url.endsWith("/api/plan/recent")) {
        return jsonResponse({
          plans: [],
        });
      }

      if (url.endsWith("/api/planner-options")) {
        return jsonResponse(JSON.parse(String(init?.body)));
      }

      if (url.endsWith("/api/sessions")) {
        return jsonResponse({
          sessionId: "원본 제목_20260421_010203",
          rootPath: "/app/runs/plans/원본 제목_20260421_010203",
          source: {
            videoPath: "/videos/source.mp4",
            channelName: "예시 채널",
            originalTitle: "원본 제목",
          },
          jobs: [],
        });
      }

      if (url.endsWith(`/api/sessions/${defaultEncodedSessionId}/transcribe`)) {
        const body = JSON.parse(String(init?.body));
        const mode = body.transcriptSource.mode as string;

        return jsonResponse({
          sessionId: "원본 제목_20260421_010203",
          rootPath: "/app/runs/plans/원본 제목_20260421_010203",
          source: {
            videoPath: "/videos/source.mp4",
            channelName: "예시 채널",
            originalTitle: "원본 제목",
          },
          latestTranscription: {
            mode,
            engine:
              mode === "api_stt"
                ? "openai"
                : mode === "local_stt"
                  ? body.transcriptSource.engine
                  : "manual_file",
            model:
              mode === "api_stt"
                ? "whisper-1"
                : mode === "local_stt"
                  ? body.transcriptSource.modelId || ""
                  : undefined,
            artifactPaths: {
              transcriptPath:
                "/app/runs/plans/원본 제목_20260421_010203/transcripts/transcript.txt",
              metadataPath:
                "/app/runs/plans/원본 제목_20260421_010203/transcripts/transcript.meta.json",
            },
          },
          jobs: [
            {
              id: "job-transcribe-001",
              kind: "transcribe",
              status: "completed",
            },
          ],
        });
      }

      if (url.endsWith(`/api/sessions/${defaultEncodedSessionId}/plan`)) {
        return jsonResponse(buildPlanResponse());
      }

      if (url.endsWith("/api/plan/import")) {
        return jsonResponse(
          buildPlanResponse({
            planId: "plan-imported",
            sessionId: "imported-session",
            source: {
              videoPath: "/videos/imported.mp4",
              transcriptPath: "/app/runs/plans/imported-session/transcripts/transcript.txt",
              channelName: "가져온채널",
              originalTitle: "가져온 제목",
            },
            transcription: {
              mode: "api_stt",
              engine: "openai",
              model: "whisper-1",
              artifactPaths: {
                transcriptPath:
                  "/app/runs/plans/imported-session/transcripts/transcript.txt",
                metadataPath:
                  "/app/runs/plans/imported-session/transcripts/transcript.meta.json",
              },
            },
            importMetadata: {
              provider: "codex",
              model: "gpt-5.4-mini",
              channelImagePath: "/images/imported-channel.png",
            },
            clips: [
              {
                id: "short-010",
                start: "00:03:00.000",
                end: "00:03:35.000",
                reason: "imported hook",
                topHighlightCandidates: ["가져온 강조 1", "가져온 강조 2", "가져온 강조 3"],
                topGeneralCandidates: ["가져온 본문 1", "가져온 본문 2", "가져온 본문 3"],
              },
            ],
          }),
        );
      }

      if (url.startsWith("/api/transcript/cues?")) {
        return jsonResponse({ cues: [{ start: 69.366, end: 75, text: "실제 대사 자막" }] });
      }

      if (url.endsWith("/api/projects/generate")) {
        return jsonResponse({
          runId: "run-001",
          projects: [
            {
              selectionId: "short-001",
              projectPath:
                "/Users/example/Movies/CapCut/User Data/Projects/com.lveditor.draft/run-001/short-001",
            },
          ],
          failures: [],
          warnings: [],
        });
      }

      if (url.endsWith("/api/pick-path")) {
        return jsonResponse({
          canceled: false,
          path: "/picked/from-dialog",
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("switches between shorts planning and options with two top tabs", () => {
    render(<HomeScreen />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "쇼츠 후보 생성" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Video path")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "옵션" }));

    expect(screen.getByRole("tab", { name: "쇼츠 후보 생성" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "옵션" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByLabelText("Video path")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Options model list")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "쇼츠 후보 생성" }));
    expect(screen.getByLabelText("Video path")).toBeInTheDocument();
  });

  it("saves editable model lists, the default model, and the prompt", async () => {
    const firstRender = render(<HomeScreen />);

    fireEvent.click(screen.getByRole("tab", { name: "옵션" }));
    fireEvent.change(screen.getByLabelText("Options model list"), {
      target: { value: "gpt-custom\ngpt-backup" },
    });
    fireEvent.change(screen.getByLabelText("Planner prompt"), {
      target: { value: "인터뷰의 뜻밖의 반전을 우선해서 골라라." },
    });
    fireEvent.change(screen.getByLabelText("Planner few-shot examples"), {
      target: { value: "저장 강조 | 저장 일반" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옵션 저장" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "옵션을 저장했습니다.",
      ),
    );
    firstRender.unmount();

    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("tab", { name: "옵션" }));

    expect(screen.getByLabelText("Options model list")).toHaveValue(
      "gpt-custom\ngpt-backup",
    );
    expect(screen.getByRole("combobox", { name: "Options model" })).toHaveTextContent(
      "gpt-custom",
    );
    expect(screen.getByLabelText("Planner prompt")).toHaveValue(
      "인터뷰의 뜻밖의 반전을 우선해서 골라라.",
    );
    expect(screen.getByLabelText("Planner few-shot examples")).toHaveValue(
      "저장 강조 | 저장 일반",
    );

    fireEvent.click(screen.getByRole("tab", { name: "쇼츠 후보 생성" }));
    fillBaseFields();
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const planBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(planBody).toMatchObject({
      provider: "codex",
      model: "gpt-custom",
      promptInstructions: "인터뷰의 뜻밖의 반전을 우선해서 골라라.",
      fewShotExamples: [{ highlight: "저장 강조", general: "저장 일반" }],
    });
  });

  it("uses the shared file picker for the video path", async () => {
    render(<HomeScreen />);

    fireEvent.click(screen.getAllByRole("button", { name: "찾아보기" })[0]);

    expect(await screen.findByDisplayValue("/picked/from-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Video path")).toHaveValue("/picked/from-dialog");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/pick-path",
    ]);
  });

  it("resets the video browse button when the file picker request stalls", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();

      if (url.endsWith("/api/pick-path")) {
        return new Promise(() => undefined);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      render(<HomeScreen />);

      fireEvent.click(screen.getAllByRole("button", { name: "찾아보기" })[0]);

      expect(screen.getByRole("button", { name: "열기 중..." })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_001);
      });

      expect(screen.getAllByRole("button", { name: "찾아보기" })[0]).toBeEnabled();
      expect(
        screen.getByText("파일 선택 응답이 지연되어 중단했습니다. 다시 시도하세요."),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks planning when OpenAI transcription is selected without an API key", () => {
    render(<HomeScreen />);

    fillBaseFields();
    fireEvent.click(screen.getByRole("radio", { name: "OpenAI 전사" }));
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("OpenAI API 키를 입력하세요.")).toBeInTheDocument();
  });

  it("creates a session, transcribes, and plans through the new session pipeline", async () => {
    render(<HomeScreen />);

    fillBaseFields();
    openAdvancedSettings();
    fireEvent.click(screen.getByRole("radio", { name: "5개" }));
    fireEvent.click(screen.getByRole("radio", { name: "15~30초" }));
    fireEvent.click(screen.getByRole("radio", { name: "자막 5개" }));
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    expect((await screen.findAllByText("강조 1")).length).toBeGreaterThan(0);
    expect(screen.getByText("123,456 tokens")).toBeInTheDocument();

    expect(fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => !url.startsWith("/api/transcript/cues?"))).toEqual([
      "/api/sessions",
      `/api/sessions/${defaultEncodedSessionId}/transcribe`,
      `/api/sessions/${defaultEncodedSessionId}/plan`,
    ]);

    const createSessionBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const transcribeBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const planBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));

    expect(createSessionBody).toEqual({
      videoPath: "/videos/source.mp4",
      channelName: "예시 채널",
      channelImagePath: "",
      originalTitle: "원본 제목",
    });
    expect(transcribeBody).toEqual({
      transcriptSource: {
        mode: "manual_file",
        transcriptPath: "/transcripts/source.txt",
      },
    });
    expect(planBody).toMatchObject({
      provider: "codex",
      model: "gpt-6.1-sol",
      settings: {
        clipCount: 5,
        minClipDurationSeconds: 15,
        maxClipDurationSeconds: 30,
        subtitleCandidateCount: 5,
      },
    });
    expect(planBody.promptInstructions).toContain(
      "너는 원본 영상의 전사를 바탕으로 짧은 영상의 편집 구간을 기획하는 편집자다.",
    );
    expect(planBody.fewShotExamples).toHaveLength(6);
  });

  it("encodes session ids before calling dynamic session endpoints", async () => {
    const sessionId = "원본 제목 #shorts_20260421_010203";
    const encodedSessionId = encodeURIComponent(sessionId);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();

      if (url.endsWith("/api/sessions")) {
        return jsonResponse({
          sessionId,
          rootPath: "/app/runs/plans/원본 제목 #shorts_20260421_010203",
          source: {
            videoPath: "/videos/source.mp4",
            channelName: "예시 채널",
            originalTitle: "원본 제목",
          },
          jobs: [],
        });
      }

      if (url.endsWith("/transcribe")) {
        return jsonResponse({
          sessionId,
          rootPath: "/app/runs/plans/원본 제목 #shorts_20260421_010203",
          source: {
            videoPath: "/videos/source.mp4",
            channelName: "예시 채널",
            originalTitle: "원본 제목",
          },
          latestTranscription: {
            mode: "manual_file",
            engine: "manual_file",
            artifactPaths: {
              transcriptPath:
                "/app/runs/plans/원본 제목 #shorts_20260421_010203/transcripts/transcript.txt",
              metadataPath:
                "/app/runs/plans/원본 제목 #shorts_20260421_010203/transcripts/transcript.meta.json",
            },
          },
          jobs: [
            {
              id: "job-transcribe-001",
              kind: "transcribe",
              status: "completed",
            },
          ],
        });
      }

      if (url.endsWith("/plan")) {
        return jsonResponse(buildPlanResponse({ sessionId }));
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    render(<HomeScreen />);

    fillBaseFields();
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => !url.startsWith("/api/transcript/cues?"))).toEqual([
      "/api/sessions",
      `/api/sessions/${encodedSessionId}/transcribe`,
      `/api/sessions/${encodedSessionId}/plan`,
    ]);
  });

  it("installs managed local stt and sends the mlx transcription request shape", async () => {
    render(<HomeScreen />);

    fireEvent.change(screen.getByLabelText("Video path"), {
      target: { value: "/videos/source.mp4" },
    });
    fireEvent.change(screen.getByLabelText("Channel name"), {
      target: { value: "예시 채널" },
    });
    fireEvent.change(screen.getByLabelText("Original title"), {
      target: { value: "원본 제목" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "로컬 전사" }));
    fireEvent.click(await screen.findByRole("button", { name: "설치 항목 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "설치 시작" }));
    expect(await screen.findByRole("button", { name: "제거" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    expect((await screen.findAllByText("강조 1")).length).toBeGreaterThan(0);

    const transcribeCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith(`/api/sessions/${defaultEncodedSessionId}/transcribe`),
    );
    const transcribeBody = JSON.parse(String(transcribeCall?.[1]?.body));

    expect(transcribeBody).toEqual({
      transcriptSource: {
        mode: "local_stt",
        engine: "mlx_whisper",
        modelId: "mlx-community/whisper-medium",
      },
    });
  });

  it("clears reviewed state when the transcription configuration changes", async () => {
    render(<HomeScreen />);

    fillBaseFields();
    fireEvent.click(screen.getByRole("button", { name: "쇼츠 후보 생성" }));

    expect((await screen.findAllByText("후보 2개")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "로컬 전사" }));

    await waitFor(() => {
      expect(screen.queryByText("후보 2개")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("입력이 바뀌어 이전 후보를 무효화했습니다. 다시 후보를 생성하세요."),
    ).toBeInTheDocument();
  });

  it("hydrates imported plans into the new transcription mode controls", async () => {
    render(<HomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: "후보 불러오기" }));

    expect(await screen.findByDisplayValue("/videos/imported.mp4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("가져온채널")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Transcript path"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "OpenAI 전사" })).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  it("loads a recent completed plan without opening the file picker", async () => {
    const recentPlanFilePath = "/app/runs/plans/recent-session/plans/plan.json";

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();

      if (url.endsWith("/api/plan/recent")) {
        return jsonResponse({
          plans: [
            {
              savedAt: "2026-04-28T04:00:00.000Z",
              planFilePath: recentPlanFilePath,
              sessionDirectoryPath: "/app/runs/plans/recent-session",
              planId: "plan-recent",
              originalTitle: "최근 제목",
              channelName: "최근채널",
              videoPath: "/videos/recent.mp4",
              clipCount: 2,
              provider: "codex",
              model: "gpt-5.5",
              transcriptionMode: "manual_file",
            },
          ],
        });
      }

      if (url.endsWith("/api/plan/import")) {
        const body = JSON.parse(String(init?.body));

        return jsonResponse(
          buildPlanResponse({
            planId: "plan-recent",
            sessionId: "recent-session",
            source: {
              videoPath: "/videos/recent.mp4",
              transcriptPath: "/app/runs/plans/recent-session/transcripts/transcript.txt",
              channelName: "최근채널",
              originalTitle: "최근 제목",
            },
            transcription: {
              mode: "manual_file",
              engine: "manual_file",
              artifactPaths: {
                transcriptPath:
                  "/app/runs/plans/recent-session/transcripts/transcript.txt",
                metadataPath:
                  "/app/runs/plans/recent-session/transcripts/transcript.meta.json",
                originalInputPath: "/transcripts/recent.txt",
              },
            },
            importMetadata: {
              provider: "codex",
              model: "gpt-5.5",
              channelImagePath: "/images/recent-channel.png",
            },
            snapshot: {
              outputRootPath: "/app/runs/plans",
              sessionDirectoryPath: "/app/runs/plans/recent-session",
              planFilePath: body.planFilePath,
            },
          }),
        );
      }

      if (url.endsWith("/api/pick-path")) {
        throw new Error("Recent plan loading should not open the file picker");
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    render(<HomeScreen />);

    fireEvent.click(screen.getByRole("combobox", { name: "Recent plans" }));
    fireEvent.click(await screen.findByRole("option", { name: /최근 제목/ }));

    expect(await screen.findByDisplayValue("/videos/recent.mp4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/transcripts/recent.txt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("최근채널")).toBeInTheDocument();
    expect((await screen.findAllByText("강조 1")).length).toBeGreaterThan(0);

    const importCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/plan/import"),
    );
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      planFilePath: recentPlanFilePath,
    });
  });

  it("coerces legacy form values so new transcription fields always exist", () => {
    const values = coercePlannerFormValues({
      videoPath: "/videos/source.mp4",
      transcriptPath: "/transcripts/source.txt",
      channelName: "예시 채널",
      channelImagePath: "",
      originalTitle: "원본 제목",
      provider: "codex",
      model: "gpt-5.4",
      openaiApiKey: "",
      clipCountMode: "10",
      clipCountCustom: "",
      clipDurationRangeKey: "30-60",
      subtitleCandidateCountMode: "3",
      subtitleCandidateCountCustom: "",
    });

    expect(values.transcriptMode).toBe("manual_file");
    expect(values.localModelPath).toBe("");
    expect(values.apiTranscriptionModel).toBe("whisper-1");
  });
});
