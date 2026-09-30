import { z } from "zod";

import type {
  PlannerClip,
  PlannerOutput,
  PlannerSettings,
  PlannerSource,
} from "@/types/planner";
import {
  DEFAULT_PLANNER_SETTINGS,
} from "@/lib/planner/settings";

const timecodePattern = /^\d{2}:\d{2}:\d{2}\.\d{3}$/;

function timecodeToMilliseconds(value: string): number | null {
  const match = timecodePattern.exec(value);
  if (!match) {
    return null;
  }

  const [hours, minutes, seconds, milliseconds] = value
    .split(/[:.]/)
    .map((part) => Number(part));

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    !Number.isInteger(milliseconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59 ||
    milliseconds < 0 ||
    milliseconds > 999
  ) {
    return null;
  }

  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
}

function millisecondsToTimecode(totalMilliseconds: number): string {
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`,
  ].join(":");
}

export function normalizePlannerClipDurations(
  output: unknown,
  settings: PlannerSettings,
): unknown {
  if (
    typeof output !== "object" ||
    output === null ||
    !("clips" in output) ||
    !Array.isArray(output.clips)
  ) {
    return output;
  }

  const minDurationMs = settings.minClipDurationSeconds * 1000;
  const maxDurationMs = settings.maxClipDurationSeconds * 1000;

  return {
    ...output,
    clips: output.clips.map((clip: unknown) => {
      if (
        typeof clip !== "object" ||
        clip === null ||
        !("start" in clip) ||
        !("end" in clip) ||
        typeof clip.start !== "string" ||
        typeof clip.end !== "string"
      ) {
        return clip;
      }

      const start = timecodeToMilliseconds(clip.start);
      const end = timecodeToMilliseconds(clip.end);

      if (start === null || end === null || end <= start) {
        return clip;
      }

      const durationMs = end - start;

      if (durationMs < minDurationMs) {
        return {
          ...clip,
          end: millisecondsToTimecode(start + minDurationMs),
        };
      }

      if (durationMs <= maxDurationMs) {
        return clip;
      }

      return {
        ...clip,
        end: millisecondsToTimecode(start + maxDurationMs),
      };
    }),
  };
}

export const trimOverlongPlannerClips = normalizePlannerClipDurations;

const timecodeSchema = z
  .string()
  .trim()
  .refine((value) => timecodeToMilliseconds(value) !== null, {
    message: "Invalid timecode",
  });

const nonEmptyStringSchema = z.string().trim().min(1);

const plannerSourceSchema: z.ZodType<PlannerSource> = z
  .object({
    videoPath: nonEmptyStringSchema,
    transcriptPath: nonEmptyStringSchema,
    channelName: nonEmptyStringSchema,
    originalTitle: nonEmptyStringSchema,
});

function createCandidateSchema(candidateCount: number) {
  return z.array(nonEmptyStringSchema).length(candidateCount);
}

export function createPlannerClipSchema(
  settings: PlannerSettings,
): z.ZodType<PlannerClip> {
  return z
    .object({
      id: nonEmptyStringSchema,
      start: timecodeSchema,
      end: timecodeSchema,
      reason: nonEmptyStringSchema,
      topHighlightCandidates: createCandidateSchema(
        settings.subtitleCandidateCount,
      ),
      topGeneralCandidates: createCandidateSchema(
        settings.subtitleCandidateCount,
      ),
    })
    .superRefine((clip, context) => {
      const start = timecodeToMilliseconds(clip.start);
      const end = timecodeToMilliseconds(clip.end);

      if (start === null || end === null) {
        return;
      }

      if (end <= start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Clip end must be after start",
          path: ["end"],
        });
      }

      const durationMs = end - start;
      const minDurationMs = settings.minClipDurationSeconds * 1000;
      const maxDurationMs = settings.maxClipDurationSeconds * 1000;

      if (durationMs < minDurationMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Clip duration must be at least ${settings.minClipDurationSeconds} seconds`,
          path: ["end"],
        });
      }

      if (durationMs > maxDurationMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Clip duration must be ${settings.maxClipDurationSeconds} seconds or less`,
          path: ["end"],
        });
      }
    });
}

export function createPlannerOutputSchema(
  settings: PlannerSettings,
): z.ZodType<PlannerOutput> {
  return z
    .object({
      source: plannerSourceSchema,
      clips: z.array(createPlannerClipSchema(settings)).length(settings.clipCount),
    })
    .superRefine((output, context) => {
      let previousStart: number | null = null;

      output.clips.forEach((clip, index) => {
        const currentStart = timecodeToMilliseconds(clip.start);

        if (currentStart === null) {
          return;
        }

        if (previousStart !== null && currentStart < previousStart) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Clips must be sorted by start time",
            path: ["clips", index, "start"],
          });
        }

        previousStart = currentStart;
      });
    });
}

export const plannerClipSchema = createPlannerClipSchema(DEFAULT_PLANNER_SETTINGS);
export const plannerOutputSchema = createPlannerOutputSchema(DEFAULT_PLANNER_SETTINGS);

const providerStringSchema = {
  type: "string",
  minLength: 1,
  pattern: "\\S",
} as const;

const providerTimecodeSchema = {
  type: "string",
  pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$",
} as const;

export function createPlannerProviderJsonSchema(settings: PlannerSettings) {
  const providerCandidateSchema = {
    type: "array",
    minItems: settings.subtitleCandidateCount,
    maxItems: settings.subtitleCandidateCount,
    items: providerStringSchema,
  } as const;

  return {
    type: "object",
    additionalProperties: false,
    required: ["source", "clips"],
    properties: {
      source: {
        type: "object",
        additionalProperties: false,
        required: [
          "videoPath",
          "transcriptPath",
          "channelName",
          "originalTitle",
        ],
        properties: {
          videoPath: providerStringSchema,
          transcriptPath: providerStringSchema,
          channelName: providerStringSchema,
          originalTitle: providerStringSchema,
        },
      },
      clips: {
        type: "array",
        minItems: settings.clipCount,
        maxItems: settings.clipCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "start",
            "end",
            "reason",
            "topHighlightCandidates",
            "topGeneralCandidates",
          ],
          properties: {
            id: providerStringSchema,
            start: providerTimecodeSchema,
            end: providerTimecodeSchema,
            reason: providerStringSchema,
            topHighlightCandidates: providerCandidateSchema,
            topGeneralCandidates: providerCandidateSchema,
          },
        },
      },
    },
  } as const;
}

export const plannerProviderJsonSchema = createPlannerProviderJsonSchema(
  DEFAULT_PLANNER_SETTINGS,
);
