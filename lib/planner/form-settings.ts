import {
  CLIP_COUNT_PRESETS,
  CLIP_DURATION_RANGE_PRESETS,
  DEFAULT_PLANNER_SETTINGS,
  findClipDurationRangePreset,
  isClipCountPreset,
  isClipDurationRangePresetKey,
  isSubtitleCandidateCountPreset,
  SUBTITLE_CANDIDATE_COUNT_PRESETS,
} from "@/lib/planner/settings";
import type { PlannerSettings } from "@/types/planner";

export type PlannerSettingsFormValues = {
  clipCountMode: `${(typeof CLIP_COUNT_PRESETS)[number]}` | "custom";
  clipCountCustom: string;
  clipDurationRangeKey: (typeof CLIP_DURATION_RANGE_PRESETS)[number]["key"];
  subtitleCandidateCountMode:
    | `${(typeof SUBTITLE_CANDIDATE_COUNT_PRESETS)[number]}`
    | "custom";
  subtitleCandidateCountCustom: string;
};

export function createInitialPlannerSettingsFormValues(): PlannerSettingsFormValues {
  return {
    clipCountMode: String(DEFAULT_PLANNER_SETTINGS.clipCount) as PlannerSettingsFormValues["clipCountMode"],
    clipCountCustom: "",
    clipDurationRangeKey: findClipDurationRangePreset(DEFAULT_PLANNER_SETTINGS)?.key ?? "30-60",
    subtitleCandidateCountMode: String(
      DEFAULT_PLANNER_SETTINGS.subtitleCandidateCount,
    ) as PlannerSettingsFormValues["subtitleCandidateCountMode"],
    subtitleCandidateCountCustom: "",
  };
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  return parsed > 0 ? parsed : null;
}

export function resolvePlannerSettingsFromForm(values: PlannerSettingsFormValues): {
  settings: PlannerSettings | null;
  error: string | null;
} {
  const clipCount =
    values.clipCountMode === "custom"
      ? parsePositiveInteger(values.clipCountCustom)
      : Number(values.clipCountMode);

  if (!clipCount) {
    return {
      settings: null,
      error: "만들 클립 후보 개수를 올바르게 입력하세요.",
    };
  }

  const subtitleCandidateCount =
    values.subtitleCandidateCountMode === "custom"
      ? parsePositiveInteger(values.subtitleCandidateCountCustom)
      : Number(values.subtitleCandidateCountMode);

  if (!subtitleCandidateCount) {
    return {
      settings: null,
      error: "자막 후보 개수를 올바르게 입력하세요.",
    };
  }

  const clipDurationRangePreset = CLIP_DURATION_RANGE_PRESETS.find(
    (preset) => preset.key === values.clipDurationRangeKey,
  );

  if (!clipDurationRangePreset) {
    return {
      settings: null,
      error: "쇼츠 구간 길이 범위를 선택하세요.",
    };
  }

  return {
    settings: {
      clipCount,
      minClipDurationSeconds: clipDurationRangePreset.min,
      maxClipDurationSeconds: clipDurationRangePreset.max,
      subtitleCandidateCount,
    },
    error: null,
  };
}

export function inferPlannerSettingsFormValues(
  settings: PlannerSettings,
): PlannerSettingsFormValues {
  return {
    clipCountMode: isClipCountPreset(settings.clipCount)
      ? String(settings.clipCount) as PlannerSettingsFormValues["clipCountMode"]
      : "custom",
    clipCountCustom: isClipCountPreset(settings.clipCount)
      ? ""
      : String(settings.clipCount),
    clipDurationRangeKey: (() => {
      const preset = findClipDurationRangePreset(settings);

      if (preset && isClipDurationRangePresetKey(preset.key)) {
        return preset.key;
      }

      return "30-60";
    })(),
    subtitleCandidateCountMode: isSubtitleCandidateCountPreset(
      settings.subtitleCandidateCount,
    )
      ? String(settings.subtitleCandidateCount) as PlannerSettingsFormValues["subtitleCandidateCountMode"]
      : "custom",
    subtitleCandidateCountCustom: isSubtitleCandidateCountPreset(
      settings.subtitleCandidateCount,
    )
      ? ""
      : String(settings.subtitleCandidateCount),
  };
}
