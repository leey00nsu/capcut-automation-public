"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CircleUserRound,
  Clapperboard,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

import { DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH } from "@/lib/capcut/template-assets";
import { LocalSttSetupPanel } from "@/components/local-stt-setup-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildChannelImagePreviewSrc } from "@/lib/media/preview-sources";
import type { PlannerSettingsFormValues } from "@/lib/planner/form-settings";
import { CLIP_DURATION_RANGE_PRESETS } from "@/lib/planner/settings";
import type { LocalSttStatusResponse } from "@/types/local-stt";
import type {
  PlannerModel,
  PlannerProvider,
  RecentPlanEntry,
} from "@/types/planner";

export type PlannerFormValues = PlannerSettingsFormValues & {
  videoPath: string;
  transcriptPath: string;
  transcriptMode: "manual_file" | "local_stt" | "api_stt";
  localModelPath: string;
  apiTranscriptionModel: "whisper-1";
  channelName: string;
  channelImagePath: string;
  originalTitle: string;
  provider: PlannerProvider;
  model: PlannerModel;
  openaiApiKey: string;
};

export type PathFieldName =
  | "videoPath"
  | "transcriptPath"
  | "localModelPath"
  | "channelImagePath";

type InputFormProps = {
  values: PlannerFormValues;
  status: "idle" | "planning" | "review" | "generating" | "results";
  error: string | null;
  browsingField: PathFieldName | null;
  importingPlan: boolean;
  localSttStatus: LocalSttStatusResponse | null;
  localSttBusy: boolean;
  recentPlans: RecentPlanEntry[];
  recentPlansLoading: boolean;
  recentPlansLoaded: boolean;
  onChange: (patch: Partial<PlannerFormValues>) => void;
  onBrowse: (field: PathFieldName) => void;
  onRefreshLocalStt: () => void;
  onInstallLocalStt: (fingerprint: string) => void;
  onRepairLocalStt: () => void;
  onUninstallLocalStt: () => void;
  onRefreshRecentPlans: () => void;
  onLoadRecentPlan: (planFilePath: string) => void;
  onImport: () => void;
  onSubmit: () => void;
  subtitleSettings?: ReactNode;
};

function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <label
        htmlFor={htmlFor}
        className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function formatRecentPlanSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);

  if (Number.isNaN(parsed.getTime())) {
    return savedAt;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function InputForm({
  values,
  status,
  error,
  browsingField,
  importingPlan,
  localSttStatus,
  localSttBusy,
  recentPlans,
  recentPlansLoading,
  recentPlansLoaded,
  onChange,
  onBrowse,
  onRefreshLocalStt,
  onInstallLocalStt,
  onRepairLocalStt,
  onUninstallLocalStt,
  onRefreshRecentPlans,
  onLoadRecentPlan,
  onImport,
  onSubmit,
  subtitleSettings,
}: InputFormProps) {
  const isBusy = status === "planning" || status === "generating" || importingPlan;
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [channelImagePreviewSrc, setChannelImagePreviewSrc] = useState(
    buildChannelImagePreviewSrc(values.channelImagePath),
  );
  const phaseLabel =
    status === "idle"
      ? "대기"
      : status === "planning"
        ? "후보 생성 중"
        : status === "review"
          ? "검토 중"
          : status === "generating"
            ? "생성 중"
            : "완료";

  useEffect(() => {
    setChannelImagePreviewSrc(buildChannelImagePreviewSrc(values.channelImagePath));
  }, [values.channelImagePath]);

  return (
    <Card
      className="overflow-hidden border-white/6 bg-[color:var(--glass)] backdrop-blur-xl"
    >
      <CardHeader className="flex flex-col gap-4 px-6 pt-6 md:flex-row md:items-center md:justify-between md:px-8 md:pt-8">
        <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.4rem]">
          쇼츠 후보 생성
        </CardTitle>
        <Badge variant="accent">{phaseLabel}</Badge>
      </CardHeader>

      <CardContent className="px-6 pb-6 md:px-8 md:pb-8">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-4 rounded-[1.4rem] bg-surface-highest/95 p-4 ring-1 ring-white/6 md:grid-cols-2 md:gap-5 md:p-5">
            <Field htmlFor="video-path" label="원본 영상">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Clapperboard className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="video-path"
                    aria-label="Video path"
                    value={values.videoPath}
                    onChange={(event) => onChange({ videoPath: event.target.value })}
                    placeholder="/Users/name/Videos/source.mp4"
                    disabled={isBusy}
                    className="pl-11"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || browsingField !== null}
                  onClick={() => onBrowse("videoPath")}
                  className="h-12 shrink-0 px-4"
                >
                  {browsingField === "videoPath" ? "열기 중..." : "찾아보기"}
                </Button>
              </div>
            </Field>

            <Field htmlFor="transcript-mode" label="전사 방식">
              <ToggleGroup
                id="transcript-mode"
                type="single"
                value={values.transcriptMode}
                onValueChange={(value) => {
                  if (
                    value === "manual_file" ||
                    value === "local_stt" ||
                    value === "api_stt"
                  ) {
                    onChange({
                      transcriptMode: value,
                    });
                  }
                }}
                className="grid w-full grid-cols-3 gap-2"
                aria-label="Transcript mode"
                disabled={isBusy}
              >
                <ToggleGroupItem
                  value="manual_file"
                  size="lg"
                  className="justify-center rounded-xl"
                >
                  수동 파일
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="local_stt"
                  size="lg"
                  className="justify-center rounded-xl"
                >
                  로컬 전사
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="api_stt"
                  size="lg"
                  className="justify-center rounded-xl"
                >
                  OpenAI 전사
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>

            {values.transcriptMode === "manual_file" ? (
              <Field htmlFor="transcript-path" label="전사 파일">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <FileText className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transcript-path"
                      aria-label="Transcript path"
                      value={values.transcriptPath}
                      onChange={(event) =>
                        onChange({ transcriptPath: event.target.value })
                      }
                      placeholder="/Users/name/Documents/transcript.txt"
                      disabled={isBusy}
                      className="pl-11"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || browsingField !== null}
                    onClick={() => onBrowse("transcriptPath")}
                    className="h-12 shrink-0 px-4"
                  >
                    {browsingField === "transcriptPath" ? "열기 중..." : "찾아보기"}
                  </Button>
                </div>
              </Field>
            ) : null}

            {values.transcriptMode === "local_stt" ? (
              <Field
                htmlFor="local-stt-setup"
                label="로컬 전사 셋업"
                hint="macOS Apple Silicon 전용 관리형 MLX 런타임입니다."
              >
                <div id="local-stt-setup">
                  <LocalSttSetupPanel
                    status={localSttStatus}
                    busy={isBusy || localSttBusy}
                    onRefresh={onRefreshLocalStt}
                    onInstall={onInstallLocalStt}
                    onRepair={onRepairLocalStt}
                    onUninstall={onUninstallLocalStt}
                  />
                </div>
              </Field>
            ) : null}

            {values.transcriptMode === "api_stt" ? (
              <Field
                htmlFor="transcription-model"
                label="전사 모델"
                hint="현재 세션 기반 전사는 Whisper 타임스탬프 출력 계약을 사용합니다."
              >
                <Select
                  value={values.apiTranscriptionModel}
                  onValueChange={(value) => {
                    if (value === "whisper-1") {
                      onChange({ apiTranscriptionModel: value });
                    }
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger id="transcription-model" aria-label="Transcription model">
                    <SelectValue placeholder="전사 모델 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whisper-1">Whisper-1</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field htmlFor="channel-name" label="채널명">
              <Input
                id="channel-name"
                aria-label="Channel name"
                value={values.channelName}
                onChange={(event) => onChange({ channelName: event.target.value })}
                placeholder="내 채널 이름"
                disabled={isBusy}
              />
            </Field>

            <Field
              htmlFor="channel-image-path"
              label="채널 이미지"
              hint="비워두면 기본 채널 이미지를 사용합니다."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute top-1/2 left-3.5 flex size-7 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-surface-high ring-1 ring-white/8">
                    {channelImagePreviewSrc ? (
                      <img
                        src={channelImagePreviewSrc}
                        alt="Channel image preview"
                        className="size-full object-cover"
                        onError={() => {
                          setChannelImagePreviewSrc(DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH);
                        }}
                      />
                    ) : (
                      <CircleUserRound className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <ImageIcon className="pointer-events-none absolute top-1/2 left-[3.25rem] size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="channel-image-path"
                    aria-label="Channel image path"
                    value={values.channelImagePath}
                    onChange={(event) =>
                      onChange({ channelImagePath: event.target.value })
                    }
                    placeholder="기본 채널 이미지 사용"
                    disabled={isBusy}
                    className="pl-[4.75rem]"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || browsingField !== null}
                  onClick={() => onBrowse("channelImagePath")}
                  className="h-12 shrink-0 px-4"
                >
                  {browsingField === "channelImagePath" ? "열기 중..." : "찾아보기"}
                </Button>
              </div>
            </Field>

            <Field htmlFor="original-title" label="원본 제목">
              <Input
                id="original-title"
                aria-label="Original title"
                value={values.originalTitle}
                onChange={(event) => onChange({ originalTitle: event.target.value })}
                placeholder="원본 제목"
                disabled={isBusy}
              />
            </Field>

          </div>

          <div className="rounded-[1.25rem] bg-surface-low/80 px-4 py-4 ring-1 ring-white/6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-[0.74rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  고급 설정
                </p>
                <p className="text-sm text-muted-foreground">
                  {values.transcriptMode === "manual_file"
                    ? "수동 파일"
                    : values.transcriptMode === "local_stt"
                      ? "로컬 전사"
                      : "OpenAI 전사"}{" "}
                  · {values.provider === "codex" ? "Codex" : "OpenAI API"} · {values.model} · 후보{" "}
                  {values.clipCountMode === "custom"
                    ? `${values.clipCountCustom || "?"}개`
                    : `${values.clipCountMode}개`} ·{" "}
                  {CLIP_DURATION_RANGE_PRESETS.find(
                    (preset) => preset.key === values.clipDurationRangeKey,
                  )?.label ?? values.clipDurationRangeKey} · 자막{" "}
                  {values.subtitleCandidateCountMode === "custom"
                    ? `${values.subtitleCandidateCountCustom || "?"}개`
                    : `${values.subtitleCandidateCountMode}개`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => setShowAdvancedSettings((current) => !current)}
              >
                {showAdvancedSettings ? "설정 접기" : "설정 펼치기"}
              </Button>
            </div>

            {showAdvancedSettings ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field
                  htmlFor="openai-api-key"
                  label="OpenAI API 키"
                  hint="OpenAI 플래닝 또는 OpenAI 전사를 사용할 때 필요합니다."
                >
                  <Input
                    id="openai-api-key"
                    aria-label="OpenAI API key"
                    type="password"
                    value={values.openaiApiKey}
                    onChange={(event) => onChange({ openaiApiKey: event.target.value })}
                    placeholder="sk-..."
                    disabled={
                      isBusy ||
                      (values.provider !== "openai" && values.transcriptMode !== "api_stt")
                    }
                  />
                </Field>

                <Field
                  htmlFor="clip-count"
                  label="후보 개수"
                  hint="추천할 쇼츠 후보 개수입니다."
                >
                  <div className="space-y-2">
                    <ToggleGroup
                      id="clip-count"
                      type="single"
                      value={values.clipCountMode}
                      onValueChange={(value) => {
                        if (value === "5" || value === "10" || value === "custom") {
                          onChange({ clipCountMode: value });
                        }
                      }}
                      className="grid w-full grid-cols-3 gap-2"
                      aria-label="Clip count"
                      disabled={isBusy}
                    >
                      <ToggleGroupItem value="5" size="lg" className="justify-center rounded-xl">
                        5개
                      </ToggleGroupItem>
                      <ToggleGroupItem value="10" size="lg" className="justify-center rounded-xl">
                        10개
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="custom"
                        size="lg"
                        className="justify-center rounded-xl"
                      >
                        직접 입력
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {values.clipCountMode === "custom" ? (
                      <Input
                        aria-label="Clip count custom"
                        inputMode="numeric"
                        value={values.clipCountCustom}
                        onChange={(event) =>
                          onChange({ clipCountCustom: event.target.value })
                        }
                        placeholder="예: 7"
                        disabled={isBusy}
                      />
                    ) : null}
                  </div>
                </Field>

                <Field
                  htmlFor="clip-duration-range"
                  label="클립 길이"
                  hint="추천 구간 길이 범위입니다."
                >
                  <ToggleGroup
                    id="clip-duration-range"
                    type="single"
                    value={values.clipDurationRangeKey}
                    onValueChange={(value) => {
                      if (CLIP_DURATION_RANGE_PRESETS.some((preset) => preset.key === value)) {
                        onChange({
                          clipDurationRangeKey: value as PlannerSettingsFormValues["clipDurationRangeKey"],
                        });
                      }
                    }}
                    className="grid w-full grid-cols-3 gap-2"
                    aria-label="Clip duration"
                    disabled={isBusy}
                  >
                    {CLIP_DURATION_RANGE_PRESETS.map((preset) => (
                      <ToggleGroupItem
                        key={preset.key}
                        value={preset.key}
                        size="lg"
                        className="justify-center rounded-xl"
                      >
                        {preset.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>

                <Field
                  htmlFor="subtitle-candidate-count"
                  label="자막 후보 수"
                  hint="하이라이트와 일반 자막 후보 개수에 함께 적용합니다."
                >
                  <div className="space-y-2">
                    <ToggleGroup
                      id="subtitle-candidate-count"
                      type="single"
                      value={values.subtitleCandidateCountMode}
                      onValueChange={(value) => {
                        if (value === "3" || value === "5" || value === "custom") {
                          onChange({ subtitleCandidateCountMode: value });
                        }
                      }}
                      className="grid w-full grid-cols-3 gap-2"
                      aria-label="Subtitle candidate count"
                      disabled={isBusy}
                    >
                      <ToggleGroupItem value="3" size="lg" className="justify-center rounded-xl">
                        자막 3개
                      </ToggleGroupItem>
                      <ToggleGroupItem value="5" size="lg" className="justify-center rounded-xl">
                        자막 5개
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="custom"
                        size="lg"
                        className="justify-center rounded-xl"
                      >
                        직접 입력
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {values.subtitleCandidateCountMode === "custom" ? (
                      <Input
                        aria-label="Subtitle candidate count custom"
                        inputMode="numeric"
                        value={values.subtitleCandidateCountCustom}
                        onChange={(event) =>
                          onChange({
                            subtitleCandidateCountCustom: event.target.value,
                          })
                        }
                        placeholder="예: 4"
                        disabled={isBusy}
                      />
                    ) : null}
                  </div>
                </Field>
              </div>
            ) : null}
          </div>

          {subtitleSettings}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-h-6 text-sm text-danger">
              {error ? <p>{error}</p> : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                onOpenChange={(open) => {
                  if (open && !recentPlansLoaded && !recentPlansLoading) {
                    onRefreshRecentPlans();
                  }
                }}
                onValueChange={(value) => {
                  if (!value.startsWith("__recent_")) {
                    onLoadRecentPlan(value);
                  }
                }}
                disabled={isBusy}
              >
                <SelectTrigger
                  aria-label="Recent plans"
                  className="min-w-44 sm:min-w-56"
                >
                  <SelectValue
                    placeholder={
                      recentPlansLoading ? "최근 기록 확인 중..." : "최근 후보"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {recentPlansLoading ? (
                    <SelectItem value="__recent_loading" disabled>
                      불러오는 중...
                    </SelectItem>
                  ) : recentPlans.length === 0 ? (
                    <SelectItem value="__recent_empty" disabled>
                      {recentPlansLoaded ? "최근 기록 없음" : "목록 열기"}
                    </SelectItem>
                  ) : (
                    recentPlans.map((recentPlan) => (
                      <SelectItem
                        key={recentPlan.planFilePath}
                        value={recentPlan.planFilePath}
                        className="max-w-[min(32rem,calc(100vw-3rem))]"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">
                            {recentPlan.originalTitle}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {formatRecentPlanSavedAt(recentPlan.savedAt)} ·{" "}
                            {recentPlan.channelName} · 후보 {recentPlan.clipCount}개
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isBusy}
                onClick={onImport}
                className="min-w-44"
              >
                {importingPlan ? "불러오는 중..." : "후보 불러오기"}
              </Button>
              <Button type="submit" size="lg" disabled={isBusy} className="min-w-44">
                {status === "planning" ? "후보 생성 중..." : "쇼츠 후보 생성"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
