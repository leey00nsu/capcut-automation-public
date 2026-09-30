import { z } from "zod";

import type { PlannerSettings } from "@/types/planner";

export const CLIP_COUNT_PRESETS = [5, 10] as const;
export const SUBTITLE_CANDIDATE_COUNT_PRESETS = [3, 5] as const;
export const CLIP_DURATION_RANGE_PRESETS = [
  { key: "15-30", label: "15~30초", min: 15, max: 30 },
  { key: "30-60", label: "30~60초", min: 30, max: 60 },
  { key: "60-90", label: "60~90초", min: 60, max: 90 },
] as const;

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  clipCount: 10,
  minClipDurationSeconds: 30,
  maxClipDurationSeconds: 60,
  subtitleCandidateCount: 3,
};

export const plannerSettingsSchema: z.ZodType<PlannerSettings> = z.object({
  clipCount: z.number().int().min(1, "clipCount must be at least 1"),
  minClipDurationSeconds: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(60),
  ]),
  maxClipDurationSeconds: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  subtitleCandidateCount: z.number().int().min(1, "subtitleCandidateCount must be at least 1"),
}).superRefine((value, context) => {
  const matchesPreset = CLIP_DURATION_RANGE_PRESETS.some(
    (preset) =>
      preset.min === value.minClipDurationSeconds &&
      preset.max === value.maxClipDurationSeconds,
  );

  if (!matchesPreset) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "clip duration range must match a supported preset",
      path: ["maxClipDurationSeconds"],
    });
  }
});

export function isClipCountPreset(value: number): value is (typeof CLIP_COUNT_PRESETS)[number] {
  return CLIP_COUNT_PRESETS.includes(value as (typeof CLIP_COUNT_PRESETS)[number]);
}

export function isClipDurationRangePresetKey(
  value: string,
): value is (typeof CLIP_DURATION_RANGE_PRESETS)[number]["key"] {
  return CLIP_DURATION_RANGE_PRESETS.some((preset) => preset.key === value);
}

export function findClipDurationRangePreset(settings: Pick<
  PlannerSettings,
  "minClipDurationSeconds" | "maxClipDurationSeconds"
>) {
  return CLIP_DURATION_RANGE_PRESETS.find(
    (preset) =>
      preset.min === settings.minClipDurationSeconds &&
      preset.max === settings.maxClipDurationSeconds,
  );
}

export function isSubtitleCandidateCountPreset(
  value: number,
): value is (typeof SUBTITLE_CANDIDATE_COUNT_PRESETS)[number] {
  return SUBTITLE_CANDIDATE_COUNT_PRESETS.includes(
    value as (typeof SUBTITLE_CANDIDATE_COUNT_PRESETS)[number],
  );
}
