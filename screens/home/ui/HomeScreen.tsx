"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildGenerationRequest,
  createReviewedClips,
  type ReviewedClip,
} from "@/components/clip-state";
import { ClipList } from "@/components/clip-list";
import { GenerateResult } from "@/components/generate-result";
import { PlannerOptionsPanel } from "@/components/planner-options-panel";
import { SubtitleSettingsPanel } from "@/components/subtitle-settings-panel";
import {
  PlanningStepper,
  type PlanningStepId,
} from "@/components/planning-stepper";
import { getDefaultPlannerModel } from "@/lib/ai/models";
import {
  DEFAULT_PLANNER_OPTIONS,
  PLANNER_OPTIONS_STORAGE_KEY,
  parseStoredPlannerOptions,
  type PlannerOptions,
} from "@/lib/planner/options";
import {
  createInitialPlannerSettingsFormValues,
  inferPlannerSettingsFormValues,
  resolvePlannerSettingsFromForm,
} from "@/lib/planner/form-settings";
import {
  InputForm,
  type PathFieldName,
  type PlannerFormValues,
} from "@/components/input-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ImportedPlanResponse,
  PlannerModel,
  PlanResponse,
  PlannerProvider,
  RecentPlansResponse,
} from "@/types/planner";
import type { LocalSttStatusResponse } from "@/types/local-stt";
import type { ProjectGenerationResult } from "@/types/project";
import type { PlanningSession } from "@/types/session";
import type { SubtitleCue } from "@/lib/subtitles/cues";

type Phase = "idle" | "planning" | "review" | "generating" | "results";
type WorkflowTab = "shorts" | "options";
const FILE_PICKER_TIMEOUT_MS = 30_000;

type PlanningSource = {
  videoPath: string;
  transcriptMode: PlannerFormValues["transcriptMode"];
  transcriptPath: string;
  localModelId: string;
  apiTranscriptionModel: PlannerFormValues["apiTranscriptionModel"];
  channelName: string;
  originalTitle: string;
  provider: PlannerProvider;
  model: PlannerModel;
  promptInstructions: string;
  fewShotExamples: PlannerOptions["fewShotExamples"];
  settingsKey: string;
};

type HomeScreenProps = {
  initialPlannerOptions?: PlannerOptions;
};

const initialFormValues: PlannerFormValues = {
  videoPath: "",
  transcriptPath: "",
  transcriptMode: "manual_file",
  localModelPath: "",
  apiTranscriptionModel: "whisper-1",
  channelName: "",
  channelImagePath: "",
  originalTitle: "",
  provider: "codex",
  model: getDefaultPlannerModel("codex"),
  openaiApiKey: "",
  ...createInitialPlannerSettingsFormValues(),
};

export function coercePlannerFormValues(
  values: Partial<PlannerFormValues>,
): PlannerFormValues {
  return {
    ...initialFormValues,
    ...values,
    transcriptMode: values.transcriptMode ?? initialFormValues.transcriptMode,
    localModelPath: values.localModelPath ?? initialFormValues.localModelPath,
    apiTranscriptionModel:
      values.apiTranscriptionModel ?? initialFormValues.apiTranscriptionModel,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();

  if (!response.ok) {
    const errorMessage =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "요청 처리에 실패했습니다";

    throw new Error(errorMessage);
  }

  return body as T;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMilliseconds);

    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

function requiredFieldsMissing(values: PlannerFormValues): string | null {
  const required: Array<[string, string]> = [
    [values.videoPath, "영상 경로"],
    [values.channelName, "채널명"],
    [values.originalTitle, "원본 제목"],
  ];

  if (values.transcriptMode === "manual_file") {
    required.splice(1, 0, [values.transcriptPath, "전사 경로"]);
  }

  const missing = required
    .filter(([value]) => value.trim().length === 0)
    .map(([, label]) => label);

  if (missing.length === 0) {
    return null;
  }

  return `${missing.join(", ")}을(를) 입력하세요.`;
}

function toPlanningSource(
  values: PlannerFormValues,
  localModelId = "",
  options = DEFAULT_PLANNER_OPTIONS,
): PlanningSource {
  const normalizedValues = coercePlannerFormValues(values);
  const resolvedSettings = resolvePlannerSettingsFromForm(normalizedValues);

  return {
    videoPath: normalizedValues.videoPath.trim(),
    transcriptMode: normalizedValues.transcriptMode,
    transcriptPath:
      normalizedValues.transcriptMode === "manual_file"
        ? normalizedValues.transcriptPath.trim()
        : "",
    localModelId:
      normalizedValues.transcriptMode === "local_stt"
        ? localModelId.trim()
        : "",
    apiTranscriptionModel:
      normalizedValues.transcriptMode === "api_stt"
        ? normalizedValues.apiTranscriptionModel
        : "whisper-1",
    channelName: normalizedValues.channelName.trim(),
    originalTitle: normalizedValues.originalTitle.trim(),
    provider: normalizedValues.provider,
    model: normalizedValues.model,
    promptInstructions: options.promptInstructions,
    fewShotExamples: options.fewShotExamples,
    settingsKey: resolvedSettings.settings
      ? JSON.stringify(resolvedSettings.settings)
      : JSON.stringify({
          clipCountMode: normalizedValues.clipCountMode,
          clipCountCustom: normalizedValues.clipCountCustom.trim(),
          clipDurationRangeKey: normalizedValues.clipDurationRangeKey,
          subtitleCandidateCountMode: normalizedValues.subtitleCandidateCountMode,
          subtitleCandidateCountCustom: normalizedValues.subtitleCandidateCountCustom.trim(),
        }),
  };
}

function planningSourceKey(source: PlanningSource): string {
  return JSON.stringify(source);
}

function updateClipById(
  clips: ReviewedClip[],
  clipId: string,
  patch: Partial<ReviewedClip>,
): ReviewedClip[] {
  return clips.map((clip) =>
    clip.id === clipId
      ? {
          ...clip,
          ...patch,
        }
      : clip,
  );
}

export function HomeScreen({ initialPlannerOptions }: HomeScreenProps = {}) {
  const [activeWorkflowTab, setActiveWorkflowTab] =
    useState<WorkflowTab>("shorts");
  const [phase, setPhase] = useState<Phase>("idle");
  const [formValues, setFormValues] = useState(initialFormValues);
  const [plannerOptions, setPlannerOptions] = useState<PlannerOptions>(
    initialPlannerOptions ?? DEFAULT_PLANNER_OPTIONS,
  );
  const [browsingField, setBrowsingField] = useState<PathFieldName | null>(null);
  const [importingPlan, setImportingPlan] = useState(false);
  const [recentPlans, setRecentPlans] = useState<RecentPlansResponse["plans"]>([]);
  const [recentPlansLoading, setRecentPlansLoading] = useState(false);
  const [recentPlansLoaded, setRecentPlansLoaded] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [plannedSourceKey, setPlannedSourceKey] = useState<string | null>(null);
  const [clips, setClips] = useState<ReviewedClip[]>([]);
  const [result, setResult] = useState<ProjectGenerationResult | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planningStep, setPlanningStep] = useState<PlanningStepId>("validate-input");
  const [localSttStatus, setLocalSttStatus] =
    useState<LocalSttStatusResponse | null>(null);
  const [localSttBusy, setLocalSttBusy] = useState(false);
  const safeFormValues = coercePlannerFormValues(formValues);
  const currentLocalSttModelId =
    localSttStatus?.setup.selectedModelId ?? safeFormValues.localModelPath.trim();

  const currentSourceKey = useMemo(
    () =>
      planningSourceKey(
        toPlanningSource(
          safeFormValues,
          currentLocalSttModelId,
          plannerOptions,
        ),
      ),
    [
      safeFormValues.videoPath,
      safeFormValues.transcriptMode,
      safeFormValues.transcriptPath,
      currentLocalSttModelId,
      safeFormValues.apiTranscriptionModel,
      safeFormValues.channelName,
      safeFormValues.originalTitle,
      safeFormValues.provider,
      safeFormValues.model,
      safeFormValues.clipCountMode,
      safeFormValues.clipCountCustom,
      safeFormValues.clipDurationRangeKey,
      safeFormValues.subtitleCandidateCountMode,
      safeFormValues.subtitleCandidateCountCustom,
      plannerOptions.promptInstructions,
      plannerOptions.fewShotExamples,
    ],
  );

  useEffect(() => {
    setSubtitleCues([]); setSubtitleError(null);
    const path = plan?.source.transcriptPath;
    if (!path || !plannerOptions.subtitleStyle.enabled) { setSubtitlesLoading(false); return; }
    const controller = new AbortController();
    setSubtitlesLoading(true);
    fetch(`/api/transcript/cues?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then((response) => parseJsonResponse<{ cues: SubtitleCue[] }>(response))
      .then((body) => { if (!controller.signal.aborted) setSubtitleCues(body.cues); })
      .catch((error) => { if (!controller.signal.aborted) setSubtitleError(error instanceof Error ? error.message : "전사 자막을 불러올 수 없습니다."); })
      .finally(() => { if (!controller.signal.aborted) setSubtitlesLoading(false); });
    return () => controller.abort();
  }, [plan?.source.transcriptPath, plannerOptions.subtitleStyle.enabled]);

  useEffect(() => {
    if (initialPlannerOptions) {
      setFormValues((current) => ({
        ...current,
        provider: initialPlannerOptions.provider,
        model: initialPlannerOptions.model,
      }));
      return;
    }

    const stored = parseStoredPlannerOptions(
      window.localStorage.getItem(PLANNER_OPTIONS_STORAGE_KEY),
    );

    if (!stored) {
      return;
    }

    setPlannerOptions(stored);
    setFormValues((current) => ({
      ...current,
      provider: stored.provider,
      model: stored.model,
    }));
  }, [initialPlannerOptions]);

  async function refreshLocalSttStatus() {
    setLocalSttBusy(true);

    try {
      const response = await fetch("/api/local-stt/status");
      const nextStatus = await parseJsonResponse<LocalSttStatusResponse>(response);
      setLocalSttStatus(nextStatus);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "로컬 전사 상태를 불러올 수 없습니다.",
      );
    } finally {
      setLocalSttBusy(false);
    }
  }

  async function runLocalSttAction(
    path: "/api/local-stt/install" | "/api/local-stt/repair" | "/api/local-stt/uninstall",
    body?: Record<string, unknown>,
  ) {
    setLocalSttBusy(true);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const nextStatus = await parseJsonResponse<LocalSttStatusResponse>(response);
      setLocalSttStatus(nextStatus);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "로컬 전사 셋업 작업에 실패했습니다.",
      );
    } finally {
      setLocalSttBusy(false);
    }
  }

  useEffect(() => {
    if (!plannedSourceKey || plannedSourceKey === currentSourceKey) {
      return;
    }

    setPlan(null);
    setPlannedSourceKey(null);
    setClips([]);
    setResult(null);
    setPhase("idle");
    setError("입력이 바뀌어 이전 후보를 무효화했습니다. 다시 후보를 생성하세요.");
  }, [currentSourceKey, plannedSourceKey]);

  useEffect(() => {
    if (safeFormValues.transcriptMode !== "local_stt") {
      return;
    }

    void refreshLocalSttStatus();
  }, [safeFormValues.transcriptMode]);

  async function handlePlan() {
    setPlanningStep("validate-input");

    const missing = requiredFieldsMissing(safeFormValues);

    if (missing) {
      setError(missing);
      return;
    }

    if (
      (safeFormValues.provider === "openai" ||
        safeFormValues.transcriptMode === "api_stt") &&
      safeFormValues.openaiApiKey.trim().length === 0
    ) {
      setError("OpenAI API 키를 입력하세요.");
      return;
    }

    const resolvedSettings = resolvePlannerSettingsFromForm(safeFormValues);

    if (!resolvedSettings.settings) {
      setError(resolvedSettings.error ?? "설정을 확인하세요.");
      return;
    }

    if (safeFormValues.transcriptMode === "local_stt") {
      if (!localSttStatus) {
        setError("로컬 전사 준비 상태를 확인 중입니다. 잠시 후 다시 시도하세요.");
        return;
      }

      if (localSttStatus.setup.status !== "ready") {
        setError("로컬 전사 런타임을 먼저 설치하거나 수리하세요.");
        return;
      }
    }

    setPhase("planning");
    setPlanningStep("create-session");
    setError(null);
    setResult(null);

    const planningSource = toPlanningSource(
      safeFormValues,
      currentLocalSttModelId,
      plannerOptions,
    );

    try {
      const sessionResponse = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channelImagePath: safeFormValues.channelImagePath.trim(),
          videoPath: planningSource.videoPath,
          channelName: planningSource.channelName,
          originalTitle: planningSource.originalTitle,
        }),
      });
      const session = await parseJsonResponse<PlanningSession>(sessionResponse);
      const sessionPathId = encodeURIComponent(session.sessionId);

      setPlanningStep("transcribe-source");
      const transcribeResponse = await fetch(
        `/api/sessions/${sessionPathId}/transcribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcriptSource:
              safeFormValues.transcriptMode === "manual_file"
                ? {
                    mode: "manual_file",
                    transcriptPath: safeFormValues.transcriptPath.trim(),
                  }
                : safeFormValues.transcriptMode === "local_stt"
                  ? {
                      mode: "local_stt",
                      engine: "mlx_whisper",
                      ...(currentLocalSttModelId
                        ? { modelId: currentLocalSttModelId }
                        : {}),
                    }
                  : {
                      mode: "api_stt",
                      provider: "openai",
                      model: safeFormValues.apiTranscriptionModel,
                    },
            ...(safeFormValues.transcriptMode === "api_stt"
              ? { openaiApiKey: safeFormValues.openaiApiKey.trim() }
              : {}),
          }),
        },
      );
      await parseJsonResponse<PlanningSession>(transcribeResponse);

      setPlanningStep("prepare-plan");
      setPlanningStep("await-ai");
      const response = await fetch(`/api/sessions/${sessionPathId}/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: planningSource.provider,
          model: planningSource.model,
          settings: resolvedSettings.settings,
          promptInstructions: planningSource.promptInstructions,
          fewShotExamples: planningSource.fewShotExamples,
          ...(safeFormValues.provider === "openai"
            ? { openaiApiKey: safeFormValues.openaiApiKey.trim() }
            : {}),
        }),
      });
      setPlanningStep("validate-response");
      const data = await parseJsonResponse<PlanResponse>(response);
      setPlanningStep("prepare-review");
      const reviewedClips = createReviewedClips(data);

      setPlan(data);
      setPlannedSourceKey(planningSourceKey(planningSource));
      setClips(reviewedClips);
      setPhase("review");
      setRecentPlansLoaded(false);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "후보 생성 실패");
      setPhase("idle");
    }
  }

  async function persistPlannerOptions(options: PlannerOptions) {
    const response = await fetch("/api/planner-options", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });
    const savedOptions = await parseJsonResponse<PlannerOptions>(response);

    window.localStorage.setItem(
      PLANNER_OPTIONS_STORAGE_KEY,
      JSON.stringify(savedOptions),
    );
    setPlannerOptions(savedOptions);
    return savedOptions;
  }

  async function handleSavePlannerOptions(options: PlannerOptions) {
    const savedOptions = await persistPlannerOptions(options);
    setFormValues((current) => ({
      ...current,
      provider: savedOptions.provider,
      model: savedOptions.model,
    }));
  }

  async function handleBrowse(field: PathFieldName) {
    setBrowsingField(field);
    setError(null);

    try {
      const response = await withTimeout(
        fetch("/api/pick-path", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "file" }),
        }),
        FILE_PICKER_TIMEOUT_MS,
        "파일 선택 응답이 지연되어 중단했습니다. 다시 시도하세요.",
      );

      const data = await parseJsonResponse<{ canceled?: boolean; path?: string }>(
        response,
      );

      if (data.canceled || !data.path) {
        return;
      }

      setFormValues((current) => ({
        ...current,
        [field]: data.path,
      }));
    } catch (browseError) {
      setError(
        browseError instanceof Error
          ? browseError.message
          : "경로 선택창을 열 수 없습니다.",
      );
    } finally {
      setBrowsingField(null);
    }
  }

  async function handleGenerate() {
    if (!plan) {
      setError("먼저 후보를 생성하세요.");
      return;
    }

    if (plannerOptions.subtitleStyle.enabled && (subtitlesLoading || subtitleError)) {
      setError(subtitleError ?? "대사 자막을 불러오는 중입니다.");
      return;
    }

    const request = buildGenerationRequest({
      planId: plan.planId,
      videoPath: safeFormValues.videoPath.trim(),
      originalTitle: safeFormValues.originalTitle.trim(),
      profileImagePath: safeFormValues.channelImagePath.trim(),
      transcriptPath: plan.source.transcriptPath,
      subtitleStyle: plannerOptions.subtitleStyle,
      clips,
    });

    if (request.selections.filter((selection) => selection.enabled).length === 0) {
      setError("최소 하나의 클립을 생성하도록 켜주세요.");
      return;
    }

    setPhase("generating");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/projects/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const data = await parseJsonResponse<ProjectGenerationResult>(response);
      setResult(data);
      setPhase("results");
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "프로젝트 생성 실패",
      );
      setPhase("review");
    }
  }

  function applyImportedPlan(importedPlan: ImportedPlanResponse) {
    const reviewedClips = createReviewedClips(importedPlan);
    const importedTranscriptMode = importedPlan.transcription?.mode ?? "manual_file";
    const nextValues: PlannerFormValues = {
      videoPath: importedPlan.source.videoPath,
      transcriptPath:
        importedTranscriptMode === "manual_file"
          ? importedPlan.transcription?.artifactPaths.originalInputPath ??
            importedPlan.source.transcriptPath
          : "",
      transcriptMode: importedTranscriptMode,
      localModelPath:
        importedTranscriptMode === "local_stt"
          ? importedPlan.transcription?.model ?? ""
          : "",
      apiTranscriptionModel: "whisper-1",
      channelName: importedPlan.source.channelName,
      channelImagePath: importedPlan.importMetadata.channelImagePath ?? "",
      originalTitle: importedPlan.source.originalTitle,
      provider: importedPlan.importMetadata.provider,
      model: importedPlan.importMetadata.model,
      openaiApiKey: "",
      ...inferPlannerSettingsFormValues(importedPlan.settings),
    };

    setFormValues(coercePlannerFormValues(nextValues));
    setPlan(importedPlan);
    setPlannedSourceKey(
      planningSourceKey(
        toPlanningSource(
          nextValues,
          nextValues.localModelPath,
          plannerOptions,
        ),
      ),
    );
    setClips(reviewedClips);
    setResult(null);
    setPhase("review");
  }

  async function importPlanFromPath(planFilePath: string) {
    const importResponse = await fetch("/api/plan/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planFilePath,
      }),
    });

    const importedPlan =
      await parseJsonResponse<ImportedPlanResponse>(importResponse);
    applyImportedPlan(importedPlan);
  }

  async function refreshRecentPlans() {
    if (recentPlansLoading) {
      return;
    }

    setRecentPlansLoading(true);

    try {
      const response = await fetch("/api/plan/recent");
      const data = await parseJsonResponse<RecentPlansResponse>(response);

      setRecentPlans(data.plans);
      setRecentPlansLoaded(true);
    } catch (recentError) {
      setError(
        recentError instanceof Error
          ? recentError.message
          : "최근 후보 기록을 불러올 수 없습니다.",
      );
    } finally {
      setRecentPlansLoading(false);
    }
  }

  async function handleLoadRecentPlan(planFilePath: string) {
    setImportingPlan(true);
    setError(null);

    try {
      await importPlanFromPath(planFilePath);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "최근 후보 불러오기 실패",
      );
    } finally {
      setImportingPlan(false);
    }
  }

  async function handleImportPlan() {
    setImportingPlan(true);
    setError(null);

    try {
      const pickResponse = await fetch("/api/pick-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "file" }),
      });

      const picked = await parseJsonResponse<{ canceled?: boolean; path?: string }>(
        pickResponse,
      );

      if (picked.canceled || !picked.path) {
        return;
      }

      await importPlanFromPath(picked.path);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "plan import 실패",
      );
    } finally {
      setImportingPlan(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-7 md:py-7">
      <div className="mx-auto grid w-full max-w-[1480px] gap-5">
        <div
          role="tablist"
          aria-label="Workflow tabs"
          className="grid gap-2 rounded-[1.25rem] bg-surface-low/80 p-2 ring-1 ring-white/6 sm:inline-grid sm:grid-cols-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkflowTab === "shorts"}
            aria-controls="shorts-workflow-panel"
            id="shorts-workflow-tab"
            onClick={() => setActiveWorkflowTab("shorts")}
            className={[
              "h-11 rounded-xl px-5 text-sm font-semibold transition-all",
              activeWorkflowTab === "shorts"
                ? "bg-tertiary-soft text-tertiary shadow-[inset_0_0_0_1px_rgba(101,175,255,0.22)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            ].join(" ")}
          >
            쇼츠 후보 생성
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkflowTab === "options"}
            aria-controls="options-workflow-panel"
            id="options-workflow-tab"
            onClick={() => setActiveWorkflowTab("options")}
            className={[
              "h-11 rounded-xl px-5 text-sm font-semibold transition-all",
              activeWorkflowTab === "options"
                ? "bg-tertiary-soft text-tertiary shadow-[inset_0_0_0_1px_rgba(101,175,255,0.22)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            ].join(" ")}
          >
            옵션
          </button>
        </div>

        {activeWorkflowTab === "shorts" ? (
          <section
            id="shorts-workflow-panel"
            role="tabpanel"
            aria-labelledby="shorts-workflow-tab"
            className="grid gap-5"
          >
            <InputForm
              values={safeFormValues}
              status={phase}
              error={error}
              browsingField={browsingField}
              importingPlan={importingPlan}
              localSttStatus={localSttStatus}
              localSttBusy={localSttBusy}
              recentPlans={recentPlans}
              recentPlansLoading={recentPlansLoading}
              recentPlansLoaded={recentPlansLoaded}
              onChange={(patch) =>
                setFormValues((current) =>
                  coercePlannerFormValues({
                    ...coercePlannerFormValues(current),
                    ...patch,
                  }),
                )
              }
              onBrowse={handleBrowse}
              onRefreshLocalStt={refreshLocalSttStatus}
              onInstallLocalStt={(fingerprint) =>
                void runLocalSttAction("/api/local-stt/install", {
                  acceptedPlanFingerprint: fingerprint,
                })
              }
              onRepairLocalStt={() => void runLocalSttAction("/api/local-stt/repair")}
              onUninstallLocalStt={() =>
                void runLocalSttAction("/api/local-stt/uninstall")
              }
              onRefreshRecentPlans={() => void refreshRecentPlans()}
              onLoadRecentPlan={(planFilePath) =>
                void handleLoadRecentPlan(planFilePath)
              }
              onImport={handleImportPlan}
              onSubmit={handlePlan}
              subtitleSettings={
                <SubtitleSettingsPanel
                  value={plannerOptions.subtitleStyle}
                  disabled={phase === "planning" || phase === "generating" || importingPlan}
                  onSave={async (subtitleStyle) => {
                    await persistPlannerOptions({ ...plannerOptions, subtitleStyle });
                  }}
                />
              }
            />

            {phase === "planning" ? (
          <Card className="automation-pulse bg-[color:var(--glass)] ring-white/6 backdrop-blur-xl">
            <CardContent className="px-6 py-8 md:px-8">
              <PlanningStepper currentStep={planningStep} />
            </CardContent>
          </Card>
            ) : null}

            {clips.length > 0 ? (
              <section className="grid gap-5">
            {subtitleError ? <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{subtitleError} 자막 설정에서 대사 자막 표시를 끄거나 타임코드가 있는 전사본을 사용하세요.</p> : null}
            <ClipList
              clips={clips}
              videoPath={safeFormValues.videoPath.trim()}
              channelImagePath={safeFormValues.channelImagePath.trim()}
              usage={plan?.usage}
              subtitleCues={subtitleCues}
              subtitleStyle={plannerOptions.subtitleStyle}
              disabled={phase === "planning" || phase === "generating"}
              onToggleEnabled={(clipId, enabled) => {
                setClips((current) =>
                  updateClipById(current, clipId, {
                    enabled,
                  }),
                );
              }}
              onSelectTopHighlight={(clipId, value) => {
                setClips((current) =>
                  updateClipById(current, clipId, {
                    topHighlightText: value,
                  }),
                );
              }}
              onSelectTopGeneral={(clipId, value) => {
                setClips((current) =>
                  updateClipById(current, clipId, {
                    topGeneralText: value,
                  }),
                );
              }}
            />

            <Card className="bg-[color:var(--glass)] ring-white/6 backdrop-blur-xl">
              <CardHeader className="flex flex-col gap-4 px-6 pt-6 md:flex-row md:items-end md:justify-between md:px-8 md:pt-8">
                <div className="space-y-2">
                  <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.1rem]">
                    프로젝트 생성
                  </CardTitle>
                </div>
                <Badge variant="muted">
                  선택됨: {clips.filter((clip) => clip.enabled).length}개
                </Badge>
              </CardHeader>
              <CardContent className="flex px-6 pb-6 md:px-8 md:pb-8">
                <Button
                  type="button"
                  size="lg"
                  disabled={phase === "planning" || phase === "generating" || subtitlesLoading || !!subtitleError}
                  onClick={handleGenerate}
                  className="min-w-48"
                >
                  {phase === "generating" ? "생성 중..." : "CapCut draft 생성"}
                </Button>
              </CardContent>
            </Card>
              </section>
            ) : null}

            {phase === "generating" ? (
          <Card className="automation-pulse bg-[color:var(--glass)] ring-white/6 backdrop-blur-xl">
            <CardContent className="px-6 py-8 md:px-8">
              <p className="text-sm leading-7 text-muted-foreground">
                프로젝트 생성 중...
              </p>
            </CardContent>
          </Card>
            ) : null}

            {result ? <GenerateResult result={result} clips={clips} /> : null}
          </section>
        ) : (
          <PlannerOptionsPanel
            value={plannerOptions}
            disabled={phase === "planning" || phase === "generating"}
            onSave={handleSavePlannerOptions}
          />
        )}
      </div>
    </main>
  );
}
