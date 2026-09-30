"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Save } from "lucide-react";

import { SubtitleStylePanel } from "@/components/subtitle-style-panel";
import { Button } from "@/components/ui/button";
import { SUBTITLE_PRESETS, type SubtitleStyle } from "@/lib/subtitles/style";

type Props = {
  value: SubtitleStyle;
  disabled?: boolean;
  onSave: (style: SubtitleStyle) => Promise<void>;
};

export function SubtitleSettingsPanel({ value, disabled = false, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(value), [value]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(value);
  const canSave = !disabled && !saving &&
    (draft.fontSource !== "local" || !!draft.fontPath.trim());
  const statusMessage = error ?? (saving
    ? "자막 설정을 저장 중입니다."
    : saved ? "자막 설정을 저장했습니다."
    : hasChanges ? "저장하지 않은 변경 사항이 있습니다."
    : "저장된 자막 설정을 사용 중입니다.");

  return (
    <details className="group rounded-[1.25rem] bg-surface-low/80 ring-1 ring-white/6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <div className="space-y-1">
          <span className="block text-[0.74rem] font-semibold tracking-[0.14em] text-muted-foreground">자막 설정</span>
          <span className="block text-sm text-muted-foreground">
            {value.enabled
              ? `${SUBTITLE_PRESETS.find((preset) => preset.id === value.preset)?.label} · ${value.fontSize}px · ${value.fontSource === "local" ? "로컬 폰트" : "Pretendard"}`
              : "대사 자막 표시 꺼짐"}
          </span>
        </div>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 px-4 pb-4">
        <SubtitleStylePanel value={draft} disabled={disabled || saving} onChange={(style) => {
          setDraft(style);
          setSaved(false);
          setError(null);
        }} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-danger" : "text-muted-foreground"}`}>
            {statusMessage}
          </p>
          <Button type="button" disabled={!canSave} onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSave(draft);
              setSaved(true);
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "자막 설정 저장에 실패했습니다.");
            } finally {
              setSaving(false);
            }
          }}>
            <Save className="size-4" /> 자막 설정 저장
          </Button>
        </div>
      </div>
    </details>
  );
}
