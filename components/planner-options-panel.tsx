"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save, Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_PLANNER_OPTIONS,
  formatFewShotExamples,
  normalizeModelList,
  parseFewShotExamples,
  type PlannerOptions,
} from "@/lib/planner/options";

type PlannerOptionsPanelProps = {
  value: PlannerOptions;
  disabled?: boolean;
  onSave: (options: PlannerOptions) => Promise<void> | void;
};

export function PlannerOptionsPanel({
  value,
  disabled = false,
  onSave,
}: PlannerOptionsPanelProps) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fewShotDraft, setFewShotDraft] = useState(
    formatFewShotExamples(value.fewShotExamples),
  );
  const [modelListDrafts, setModelListDrafts] = useState({
    codex: value.modelOptions.codex.join("\n"),
    openai: value.modelOptions.openai.join("\n"),
  });

  useEffect(() => {
    setDraft(value);
    setFewShotDraft(formatFewShotExamples(value.fewShotExamples));
    setModelListDrafts({
      codex: value.modelOptions.codex.join("\n"),
      openai: value.modelOptions.openai.join("\n"),
    });
  }, [value]);

  const hasChanges =
    draft.provider !== value.provider ||
    draft.model !== value.model ||
    JSON.stringify(draft.modelOptions) !== JSON.stringify(value.modelOptions) ||
    JSON.stringify(draft.defaultModels) !== JSON.stringify(value.defaultModels) ||
    draft.promptInstructions !== value.promptInstructions ||
    fewShotDraft !== formatFewShotExamples(value.fewShotExamples);
  const parsedFewShotExamples = parseFewShotExamples(fewShotDraft);
  const modelListsAreValid = (["codex", "openai"] as const).every(
    (provider) =>
      draft.modelOptions[provider].length > 0 &&
      draft.modelOptions[provider].includes(draft.defaultModels[provider]),
  );
  const canSave =
    draft.promptInstructions.trim().length > 0 &&
    parsedFewShotExamples !== null &&
    modelListsAreValid &&
    !disabled &&
    !saving;
  const statusMessage = saveError
    ? saveError
    : saving
      ? "JSON 파일에 저장 중입니다."
      : saved
        ? "옵션을 저장했습니다."
        : hasChanges
          ? "저장하지 않은 변경 사항이 있습니다."
          : "저장된 옵션을 사용 중입니다.";

  return (
    <section
      id="options-workflow-panel"
      role="tabpanel"
      aria-labelledby="options-workflow-tab"
    >
      <Card className="overflow-hidden border-white/6 bg-[color:var(--glass)] backdrop-blur-xl">
        <CardHeader className="px-6 pt-6 md:px-8 md:pt-8">
          <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.4rem]">
            옵션
          </CardTitle>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            쇼츠 기획에 사용할 모델 목록, 기본 모델과 지시문을 저장합니다. 출력 JSON
            구조와 시간·후보 수 제약은 안정적인 결과 처리를 위해 자동으로 추가됩니다.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 px-6 pb-6 md:px-8 md:pb-8">
          <div className="grid gap-5 rounded-[1.4rem] bg-surface-highest/95 p-5 ring-1 ring-white/6 md:grid-cols-2">
            <div className="space-y-2.5">
              <label className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                제공 방식
              </label>
              <ToggleGroup
                type="single"
                value={draft.provider}
                onValueChange={(provider) => {
                  if (provider === "codex" || provider === "openai") {
                    setSaved(false);
                    setDraft((current) => ({
                      ...current,
                      provider,
                      model: current.defaultModels[provider],
                    }));
                  }
                }}
                className="grid w-full grid-cols-2 gap-2"
                aria-label="Options provider type"
                disabled={disabled}
              >
                <ToggleGroupItem value="codex" size="lg" className="justify-center rounded-xl">
                  <Sparkles className="size-4" /> Codex
                </ToggleGroupItem>
                <ToggleGroupItem value="openai" size="lg" className="justify-center rounded-xl">
                  <WandSparkles className="size-4" /> OpenAI API
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2.5">
              <label
                htmlFor="options-model-list"
                className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                모델 목록
              </label>
              <textarea
                id="options-model-list"
                aria-label="Options model list"
                value={modelListDrafts[draft.provider]}
                rows={6}
                disabled={disabled}
                placeholder="모델 ID를 한 줄에 하나씩 입력"
                onChange={(event) => {
                  const nextText = event.target.value;
                  const models = normalizeModelList(nextText.split(/[\n,]/));
                  setSaved(false);
                  setModelListDrafts((current) => ({
                    ...current,
                    [draft.provider]: nextText,
                  }));
                  setDraft((current) => {
                    const currentDefault = current.defaultModels[current.provider];
                    const nextDefault = models.includes(currentDefault)
                      ? currentDefault
                      : models[0] ?? "";

                    return {
                      ...current,
                      model: nextDefault,
                      modelOptions: {
                        ...current.modelOptions,
                        [current.provider]: models,
                      },
                      defaultModels: {
                        ...current.defaultModels,
                        [current.provider]: nextDefault,
                      },
                    };
                  });
                }}
                className="min-h-36 w-full resize-y rounded-xl border border-input bg-surface-low px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {draft.provider === "codex" ? "Codex CLI" : "OpenAI API"}에 전달할
                모델 ID를 한 줄에 하나씩 입력하세요.
              </p>
            </div>

            <div className="space-y-2.5 md:col-start-2">
              <label
                htmlFor="options-planner-model"
                className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                기본 모델
              </label>
              <Select
                value={draft.model}
                onValueChange={(model) => {
                  if (draft.modelOptions[draft.provider].includes(model)) {
                    setSaved(false);
                    setDraft((current) => ({
                      ...current,
                      model,
                      defaultModels: {
                        ...current.defaultModels,
                        [current.provider]: model,
                      },
                    }));
                  }
                }}
                disabled={disabled || draft.modelOptions[draft.provider].length === 0}
              >
                <SelectTrigger id="options-planner-model" aria-label="Options model">
                  <SelectValue placeholder="기본 모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {draft.modelOptions[draft.provider].map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-end justify-between gap-4">
              <label
                htmlFor="planner-prompt-instructions"
                className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                기획 프롬프트
              </label>
              <span className="text-xs text-muted-foreground">
                {draft.promptInstructions.length.toLocaleString()} / 20,000
              </span>
            </div>
            <textarea
              id="planner-prompt-instructions"
              aria-label="Planner prompt"
              value={draft.promptInstructions}
              maxLength={20_000}
              rows={22}
              disabled={disabled}
              onChange={(event) => {
                setSaved(false);
                setDraft((current) => ({
                  ...current,
                  promptInstructions: event.target.value,
                }));
              }}
              className="min-h-80 w-full resize-y rounded-xl border border-input bg-surface-low px-4 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {!draft.promptInstructions.trim() ? (
              <p className="text-sm text-danger">프롬프트를 입력하세요.</p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-end justify-between gap-4">
              <label
                htmlFor="planner-few-shot-examples"
                className="block text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                Few-shot 후킹 예시
              </label>
              <span className="text-xs text-muted-foreground">
                {parsedFewShotExamples?.length ?? 0}개
              </span>
            </div>
            <textarea
              id="planner-few-shot-examples"
              aria-label="Planner few-shot examples"
              value={fewShotDraft}
              rows={18}
              disabled={disabled || saving}
              placeholder="강조 문구 | 일반 문구"
              onChange={(event) => {
                setSaved(false);
                setSaveError(null);
                setFewShotDraft(event.target.value);
              }}
              className="min-h-72 w-full resize-y rounded-xl border border-input bg-surface-low px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              한 줄에 하나씩 <code>강조 문구 | 일반 문구</code> 형식으로 입력하세요.
            </p>
            {parsedFewShotExamples === null ? (
              <p className="text-sm text-danger">
                유효한 few-shot 예시를 한 개 이상 입력하세요.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" role="status">
              {statusMessage}
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={disabled || saving}
                onClick={() => {
                  setSaved(false);
                  setSaveError(null);
                  setDraft(DEFAULT_PLANNER_OPTIONS);
                  setFewShotDraft(
                    formatFewShotExamples(DEFAULT_PLANNER_OPTIONS.fewShotExamples),
                  );
                  setModelListDrafts({
                    codex: DEFAULT_PLANNER_OPTIONS.modelOptions.codex.join("\n"),
                    openai: DEFAULT_PLANNER_OPTIONS.modelOptions.openai.join("\n"),
                  });
                }}
              >
                <RotateCcw className="size-4" /> 기본값 복원
              </Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  if (!parsedFewShotExamples) {
                    return;
                  }

                  const next = {
                    ...draft,
                    model: draft.defaultModels[draft.provider],
                    modelOptions: {
                      codex: normalizeModelList(draft.modelOptions.codex),
                      openai: normalizeModelList(draft.modelOptions.openai),
                    },
                    promptInstructions: draft.promptInstructions.trim(),
                    fewShotExamples: parsedFewShotExamples,
                  };
                  setSaving(true);
                  setSaveError(null);

                  try {
                    await onSave(next);
                    setDraft(next);
                    setFewShotDraft(formatFewShotExamples(next.fewShotExamples));
                    setModelListDrafts({
                      codex: next.modelOptions.codex.join("\n"),
                      openai: next.modelOptions.openai.join("\n"),
                    });
                    setSaved(true);
                  } catch (error) {
                    setSaveError(
                      error instanceof Error
                        ? error.message
                        : "옵션 저장에 실패했습니다.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Save className="size-4" /> 옵션 저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
