import { describe, expect, it } from "vitest";

import {
  createPlannerOutputSchema,
  createPlannerProviderJsonSchema,
  normalizePlannerClipDurations,
} from "@/lib/ai/schema";

function formatTimecode(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000`;
}

function createClip(index: number, subtitleCandidateCount = 3) {
  const startSecond = index * 20;
  const endSecond = index * 20 + 20;

  return {
    id: `short-${String(index + 1).padStart(3, "0")}`,
    start: formatTimecode(startSecond),
    end: formatTimecode(endSecond),
    reason: "hook",
    topHighlightCandidates: Array.from(
      { length: subtitleCandidateCount },
      (_, index) => `강조 문구 ${index + 1}`,
    ),
    topGeneralCandidates: Array.from(
      { length: subtitleCandidateCount },
      (_, index) => `보조 문구 ${index + 1}`,
    ),
  };
}

function createPlannerPayload(clipCount = 10, subtitleCandidateCount = 3) {
  return {
    source: {
      videoPath: "/tmp/video.mp4",
      transcriptPath: "/tmp/input.txt",
      channelName: "예시 채널",
      originalTitle: "원본 제목",
    },
    clips: Array.from({ length: clipCount }, (_, index) =>
      createClip(index, subtitleCandidateCount)
    ),
  };
}

describe("plannerOutputSchema", () => {
  it("accepts the requested clip count and candidate count", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 5,
    });
    const result = schema.safeParse(createPlannerPayload(5, 5));

    expect(result.success).toBe(true);
  });

  it("tolerates extra AI fields", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 10,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });
    const result = schema.safeParse({
      ...createPlannerPayload(),
      source: {
        ...createPlannerPayload().source,
        extraSourceField: "ignored",
      },
      clips: [
        {
          ...createClip(0),
          extraClipField: 123,
        },
        ...Array.from({ length: 9 }, (_, index) => createClip(index + 1)),
      ],
      extraOutputField: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(createPlannerPayload());
    }
  });

  it("rejects malformed timecodes", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 10,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });
    const result = schema.safeParse({
      ...createPlannerPayload(),
      clips: [
        {
          ...createClip(0),
          start: "99:99:99.999",
        },
        ...Array.from({ length: 9 }, (_, index) => createClip(index + 1)),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects reversed clip ranges", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 10,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });
    const result = schema.safeParse({
      ...createPlannerPayload(),
      clips: [
        {
          ...createClip(0),
          start: "00:00:10.000",
          end: "00:00:01.000",
        },
        ...Array.from({ length: 9 }, (_, index) => createClip(index + 1)),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only strings", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 10,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });
    const result = schema.safeParse({
      ...createPlannerPayload(),
      source: {
        ...createPlannerPayload().source,
        videoPath: "   ",
      },
      clips: [
        {
          ...createClip(0),
          reason: "   ",
          topHighlightCandidates: ["강조 문구 1", "강조 문구 2", "   "],
        },
        ...Array.from({ length: 9 }, (_, index) => createClip(index + 1)),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects clip arrays that do not match the requested count", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 5,
    });
    const tooFew = schema.safeParse(createPlannerPayload(4, 5));
    const tooMany = schema.safeParse(createPlannerPayload(6, 5));

    expect(tooFew.success).toBe(false);
    expect(tooMany.success).toBe(false);
  });

  it("rejects candidates that do not match the requested count", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 5,
    });

    const result = schema.safeParse(createPlannerPayload(5, 3));

    expect(result.success).toBe(false);
  });

  it("rejects clips longer than the requested maximum duration", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });

    const result = schema.safeParse({
      ...createPlannerPayload(5, 3),
      clips: [
        {
          ...createClip(0, 3),
          start: "00:00:00.000",
          end: "00:00:40.000",
        },
        ...Array.from({ length: 4 }, (_, index) => createClip(index + 1, 3)),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects clips shorter than the requested minimum duration", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 5,
      minClipDurationSeconds: 30,
      maxClipDurationSeconds: 60,
      subtitleCandidateCount: 3,
    });

    const result = schema.safeParse({
      ...createPlannerPayload(5, 3),
      clips: [
        {
          ...createClip(0, 3),
          start: "00:00:00.000",
          end: "00:00:10.000",
        },
        ...Array.from({ length: 4 }, (_, index) => ({
          ...createClip(index + 1, 3),
          start: formatTimecode((index + 1) * 30),
          end: formatTimecode((index + 1) * 30 + 35),
        })),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects clips that are not sorted by start time", () => {
    const schema = createPlannerOutputSchema({
      clipCount: 10,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    });
    const payload = createPlannerPayload();
    const [first, second, ...rest] = payload.clips;

    const result = schema.safeParse({
      ...payload,
      clips: [second, first, ...rest],
    });

    expect(result.success).toBe(false);
  });
});

describe("normalizePlannerClipDurations", () => {
  it("trims provider clips that exceed the requested maximum duration", () => {
    const output = {
      ...createPlannerPayload(5, 3),
      clips: [
        {
          ...createClip(0, 3),
          start: "00:01:10.250",
          end: "00:02:20.250",
        },
        ...Array.from({ length: 4 }, (_, index) => createClip(index + 1, 3)),
      ],
    };

    const normalized = normalizePlannerClipDurations(output, {
      clipCount: 5,
      minClipDurationSeconds: 30,
      maxClipDurationSeconds: 60,
      subtitleCandidateCount: 3,
    });

    expect((normalized as { clips: Array<{ start: string; end: string }> }).clips[0])
      .toMatchObject({
        start: "00:01:10.250",
        end: "00:02:10.250",
      });
  });

  it("extends provider clips that are shorter than the requested minimum duration", () => {
    const output = {
      ...createPlannerPayload(5, 3),
      clips: [
        {
          ...createClip(0, 3),
          start: "00:01:10.250",
          end: "00:01:25.250",
        },
        ...Array.from({ length: 4 }, (_, index) => createClip(index + 1, 3)),
      ],
    };

    const normalized = normalizePlannerClipDurations(output, {
      clipCount: 5,
      minClipDurationSeconds: 30,
      maxClipDurationSeconds: 60,
      subtitleCandidateCount: 3,
    });

    expect((normalized as { clips: Array<{ start: string; end: string }> }).clips[0])
      .toMatchObject({
        start: "00:01:10.250",
        end: "00:01:40.250",
      });
  });
});

describe("plannerProviderJsonSchema", () => {
  it("preserves provider-side structural constraints explicitly", () => {
    const plannerProviderJsonSchema = createPlannerProviderJsonSchema({
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 5,
    });

    expect(plannerProviderJsonSchema).toMatchObject({
      type: "object",
      required: ["source", "clips"],
      additionalProperties: false,
      properties: {
        source: {
          type: "object",
          required: [
            "videoPath",
            "transcriptPath",
            "channelName",
            "originalTitle",
          ],
          additionalProperties: false,
        },
        clips: {
          type: "array",
          minItems: 5,
          maxItems: 5,
        },
      },
    });

    const clipSchema = plannerProviderJsonSchema.properties.clips.items;

    expect(clipSchema).toMatchObject({
      type: "object",
      required: [
        "id",
        "start",
        "end",
        "reason",
        "topHighlightCandidates",
        "topGeneralCandidates",
      ],
      additionalProperties: false,
      properties: {
        start: {
          type: "string",
          pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$",
        },
        end: {
          type: "string",
          pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$",
        },
        topHighlightCandidates: {
          type: "array",
          minItems: 5,
          maxItems: 5,
        },
      },
    });

    expect(clipSchema.properties.reason.minLength).toBe(1);
    expect(clipSchema.properties.reason.pattern).toBe("\\S");
    expect(
      clipSchema.properties.topHighlightCandidates.items.pattern,
    ).toBe("\\S");
  });
});
