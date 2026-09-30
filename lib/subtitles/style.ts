import { z } from "zod";

export const subtitlePresetIds = ["outline", "box", "pill", "light", "band", "shadow-outline", "shadow", "gold"] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const subtitleStyleSchema = z.object({
  enabled: z.boolean(),
  preset: z.enum(subtitlePresetIds),
  fontSource: z.enum(["bundled", "local"]),
  fontPath: z.string().max(4096),
  fontSize: z.number().min(16).max(120),
  color,
  gradient: z.boolean(),
  gradientEnd: color,
  outlineWidth: z.number().min(0).max(12),
  outlineColor: color,
  backgroundEnabled: z.boolean(),
  backgroundColor: color,
  backgroundOpacity: z.number().min(0).max(1),
  backgroundRadius: z.number().min(0).max(100),
  paddingX: z.number().min(0).max(80),
  paddingY: z.number().min(0).max(60),
  borderWidth: z.number().min(0).max(12),
  borderColor: color,
  shadowEnabled: z.boolean(),
  shadowColor: color,
  shadowOpacity: z.number().min(0).max(1),
  shadowBlur: z.number().min(0).max(30),
  shadowX: z.number().min(-30).max(30),
  shadowY: z.number().min(-30).max(30),
  positionY: z.number().min(10).max(90),
});

export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true, preset: "outline", fontSource: "bundled", fontPath: "",
  fontSize: 48, color: "#ffffff", gradient: false, gradientEnd: "#e0a900",
  outlineWidth: 4, outlineColor: "#000000",
  backgroundEnabled: false, backgroundColor: "#111111", backgroundOpacity: 0.9,
  backgroundRadius: 12, paddingX: 20, paddingY: 12,
  borderWidth: 0, borderColor: "#ffffff",
  shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0.85,
  shadowBlur: 6, shadowX: 3, shadowY: 4, positionY: 82,
};

export const SUBTITLE_PRESETS: { id: SubtitleStyle["preset"]; label: string; style: Partial<SubtitleStyle> }[] = [
  { id: "outline", label: "외곽선", style: {} },
  { id: "box", label: "기본 박스", style: { outlineWidth: 0, backgroundEnabled: true } },
  { id: "pill", label: "알약 박스", style: { outlineWidth: 0, backgroundEnabled: true, backgroundRadius: 100, paddingX: 28 } },
  { id: "light", label: "밝은 박스", style: { outlineWidth: 0, color: "#111111", backgroundEnabled: true, backgroundColor: "#f5f5f5", backgroundOpacity: 1 } },
  { id: "band", label: "각진 밴드", style: { outlineWidth: 0, backgroundEnabled: true, backgroundRadius: 0, backgroundOpacity: 1, paddingX: 28 } },
  { id: "shadow-outline", label: "그림자 외곽선", style: { outlineWidth: 6, shadowEnabled: true } },
  { id: "shadow", label: "그림자", style: { outlineWidth: 0, shadowEnabled: true } },
  { id: "gold", label: "골드 그라데이션", style: { color: "#ffef93", gradient: true, gradientEnd: "#e0a900", outlineColor: "#604100", outlineWidth: 6, shadowEnabled: true } },
];

export function applySubtitlePreset(style: SubtitleStyle, id: SubtitleStyle["preset"]): SubtitleStyle {
  return { ...DEFAULT_SUBTITLE_STYLE, ...SUBTITLE_PRESETS.find((preset) => preset.id === id)?.style,
    preset: id, enabled: style.enabled, fontSource: style.fontSource, fontPath: style.fontPath,
    fontSize: style.fontSize, positionY: style.positionY };
}
