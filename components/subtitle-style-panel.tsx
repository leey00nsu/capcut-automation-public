"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubtitleFontFace, SubtitleText } from "@/components/subtitle-text";
import { applySubtitlePreset, SUBTITLE_PRESETS, type SubtitleStyle } from "@/lib/subtitles/style";

type Props = { value: SubtitleStyle; disabled?: boolean; onChange: (style: SubtitleStyle) => void };

export function SubtitleStylePanel({ value, disabled = false, onChange }: Props) {
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (update: Partial<SubtitleStyle>) => onChange({ ...value, ...update });
  async function browseFont() {
    setBrowsing(true); setError(null);
    try {
      const response = await fetch("/api/pick-path", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "file" }), signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "폰트를 선택할 수 없습니다.");
      if (body.canceled || !body.path) return;
      if (!/\.(otf|ttf)$/i.test(body.path)) throw new Error("OTF 또는 TTF 폰트 파일을 선택하세요.");
      patch({ fontSource: "local", fontPath: body.path });
    } catch (error) { setError(error instanceof Error ? error.message : "폰트 선택에 실패했습니다."); }
    finally { setBrowsing(false); }
  }
  const numeric = (key: keyof SubtitleStyle, label: string, min: number, max: number, step = 1) => (
    <label className="grid gap-1.5 text-xs text-muted-foreground" key={key}>{label}
      <Input type="number" aria-label={label} value={Number(value[key])} min={min} max={max} step={step} disabled={disabled}
        onChange={(event) => { if (event.target.value) patch({ [key]: Math.min(max, Math.max(min, Number(event.target.value))) }); }} />
    </label>
  );
  const color = (key: keyof SubtitleStyle, label: string) => (
    <label className="grid gap-1.5 text-xs text-muted-foreground" key={key}>{label}
      <input type="color" aria-label={label} value={String(value[key])} disabled={disabled}
        onChange={(event) => patch({ [key]: event.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-input bg-surface-low p-1" />
    </label>
  );
  const toggle = (key: keyof SubtitleStyle, label: string) => <label className="flex items-center gap-2 text-sm" key={key}>
    <input type="checkbox" aria-label={label} checked={Boolean(value[key])} disabled={disabled}
      onChange={(event) => patch({ [key]: event.target.checked })} className="accent-teal-400" />{label}
  </label>;
  return <section aria-label="대사 자막 설정" className="grid gap-5 rounded-2xl bg-surface-highest p-5 ring-1 ring-white/6">
    <SubtitleFontFace style={value} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold">영상 안 대사 자막</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">전사 타임코드에 맞춰 대사를 표시합니다. 크기는 1080px 캔버스 기준입니다.</p></div>
      {toggle("enabled", "대사 자막 표시")}
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5" aria-label="자막 스타일 프리셋">
      {SUBTITLE_PRESETS.map((preset) => <button type="button" key={preset.id} disabled={disabled} aria-pressed={value.preset === preset.id}
        onClick={() => onChange(applySubtitlePreset(value, preset.id))}
        className={`rounded-2xl p-2 ring-1 transition ${value.preset === preset.id ? "ring-teal-400 bg-teal-400/10" : "ring-white/10 bg-surface-low hover:ring-white/30"}`}>
        <span className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-[#737373]">
          <SubtitleText text="가나 다라" style={applySubtitlePreset(value, preset.id)} sample />
        </span><span className="mt-2 block text-xs text-muted-foreground">{preset.label}</span>
      </button>)}
    </div>
    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <label className="grid gap-1.5 text-xs text-muted-foreground">자막 폰트
        <select aria-label="자막 폰트" value={value.fontSource} disabled={disabled}
          onChange={(event) => patch({ fontSource: event.target.value as SubtitleStyle["fontSource"] })}
          className="h-10 rounded-lg border border-input bg-surface-low px-3 text-sm text-foreground">
          <option value="bundled">Pretendard Black · 기본 제공</option><option value="local">로컬 폰트 · OTF / TTF</option>
        </select>
      </label>
      <Button type="button" variant="outline" className="self-end" disabled={disabled || browsing} onClick={() => void browseFont()}>{browsing ? "선택 중..." : "로컬 폰트 선택"}</Button>
      {value.fontSource === "local" ? <Input aria-label="로컬 자막 폰트 경로" value={value.fontPath} disabled={disabled}
        placeholder="OTF 또는 TTF 파일의 절대 경로" onChange={(event) => patch({ fontPath: event.target.value })} className="md:col-span-2" /> : null}
      {error ? <p role="alert" className="text-sm text-danger md:col-span-2">{error}</p> : null}
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {numeric("fontSize", "자막 크기 (px)", 16, 120)}{color("color", "글자 색")}
      {numeric("positionY", "영상 내 세로 위치 (%)", 10, 90)}{color("gradientEnd", "그라데이션 끝 색")}
    </div>
    {toggle("gradient", "글자 그라데이션")}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {numeric("outlineWidth", "외곽선 두께", 0, 12)}{color("outlineColor", "외곽선 색")}
    </div>
    {toggle("backgroundEnabled", "텍스트 배경")}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {color("backgroundColor", "배경 색")}{numeric("backgroundOpacity", "배경 불투명도", 0, 1, 0.05)}
      {numeric("backgroundRadius", "배경 모서리", 0, 100)}{numeric("paddingX", "배경 좌우 여백", 0, 80)}
      {numeric("paddingY", "배경 상하 여백", 0, 60)}{numeric("borderWidth", "배경 테두리 두께", 0, 12)}{color("borderColor", "배경 테두리 색")}
    </div>
    {toggle("shadowEnabled", "그림자 표시")}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {color("shadowColor", "그림자 색")}{numeric("shadowOpacity", "그림자 불투명도", 0, 1, 0.05)}
      {numeric("shadowBlur", "그림자 흐림", 0, 30)}{numeric("shadowX", "그림자 가로 거리", -30, 30)}{numeric("shadowY", "그림자 세로 거리", -30, 30)}
    </div>
    <div className="flex min-h-28 items-center justify-center rounded-xl bg-[#555] p-4" aria-label="자막 스타일 미리보기">
      <SubtitleText text="작은 변화가 새로운 시작이 됩니다" style={value} sample />
    </div>
  </section>;
}
