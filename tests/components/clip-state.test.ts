import { describe, expect, it } from "vitest";

import {
  buildGenerationRequest,
  createReviewedClips,
} from "@/components/clip-state";

describe("clip state helpers", () => {
  it("initializes reviewed clips from planner output and source metadata", () => {
    const reviewedClips = createReviewedClips({
      planId: "plan-001",
      source: {
        videoPath: "/videos/source.mp4",
        transcriptPath: "/transcripts/source.txt",
        channelName: "예시 채널",
        originalTitle: "원본 제목",
      },
      clips: [
        {
          id: "short-001",
          start: "00:01:09.366",
          end: "00:01:36.800",
          reason: "hook",
          topHighlightCandidates: ["오늘의 작은 변화", "바로 걸린다", "이건 못 참지"],
          topGeneralCandidates: [
            "작은 습관부터 시작해 보세요",
            "괜히 내가 나빠짐",
            "말해줘야 하나",
          ],
        },
        {
          id: "short-002",
          start: "00:02:10.000",
          end: "00:02:22.500",
          reason: "another hook",
          topHighlightCandidates: ["두 번째 강조", "두 번째 훅", "두 번째 반전"],
          topGeneralCandidates: ["두 번째 설명", "두 번째 상황", "두 번째 질문"],
        },
      ],
    });

    expect(reviewedClips).toEqual([
      expect.objectContaining({
        id: "short-001",
        enabled: true,
        topHighlightText: "오늘의 작은 변화",
        topGeneralText: "작은 습관부터 시작해 보세요",
        channelNameText: "예시 채널",
        titleText: "원본 제목",
      }),
      expect.objectContaining({
        id: "short-002",
        enabled: true,
        topHighlightText: "두 번째 강조",
        topGeneralText: "두 번째 설명",
        channelNameText: "예시 채널",
        titleText: "원본 제목",
      }),
    ]);

    expect(reviewedClips[0]).not.toHaveProperty("selected");
  });

  it("normalizes duplicate planner ids so reviewed clips stay distinct", () => {
    const reviewedClips = createReviewedClips({
      planId: "plan-001",
      source: {
        videoPath: "/videos/source.mp4",
        transcriptPath: "/transcripts/source.txt",
        channelName: "예시 채널",
        originalTitle: "원본 제목",
      },
      clips: [
        {
          id: "short-001",
          start: "00:01:09.366",
          end: "00:01:36.800",
          reason: "hook",
          topHighlightCandidates: ["오늘의 작은 변화", "바로 걸린다", "이건 못 참지"],
          topGeneralCandidates: [
            "작은 습관부터 시작해 보세요",
            "괜히 내가 나빠짐",
            "말해줘야 하나",
          ],
        },
        {
          id: "short-001",
          start: "00:02:10.000",
          end: "00:02:22.500",
          reason: "duplicate hook",
          topHighlightCandidates: ["두 번째 강조", "두 번째 반전", "두 번째 훅"],
          topGeneralCandidates: ["두 번째 본문", "두 번째 설명", "두 번째 상황"],
        },
        {
          id: "short-001-2",
          start: "00:03:00.000",
          end: "00:03:10.000",
          reason: "collision",
          topHighlightCandidates: ["세 번째 강조", "세 번째 반전", "세 번째 훅"],
          topGeneralCandidates: ["세 번째 본문", "세 번째 설명", "세 번째 상황"],
        },
      ],
    });

    expect(reviewedClips[0].id).toBe("short-001");
    expect(reviewedClips[1].id).toBe("short-001-2");
    expect(reviewedClips[2].id).not.toBe(reviewedClips[0].id);
    expect(reviewedClips[2].id).not.toBe(reviewedClips[1].id);
    expect(new Set(reviewedClips.map((clip) => clip.id)).size).toBe(3);
  });

  it("builds a generation request from reviewed clips", () => {
    const request = buildGenerationRequest({
      planId: "plan-001",
      videoPath: "/videos/source.mp4",
      originalTitle: "원본 제목",
      profileImagePath: "/images/channel.png",
      clips: [
        {
          id: "short-001",
          start: "00:01:09.366",
          end: "00:01:36.800",
          reason: "hook",
          topHighlightCandidates: ["오늘의 작은 변화", "바로 걸린다", "이건 못 참지"],
          topGeneralCandidates: [
            "작은 습관부터 시작해 보세요",
            "괜히 내가 나빠짐",
            "말해줘야 하나",
          ],
          enabled: true,
          topHighlightText: "오늘의 작은 변화",
          topGeneralText: "작은 습관부터 시작해 보세요",
          channelNameText: "예시 채널",
          titleText: "원본 제목",
        },
        {
          id: "short-002",
          start: "00:02:10.000",
          end: "00:02:22.500",
          reason: "another hook",
          topHighlightCandidates: ["두 번째 강조", "두 번째 훅", "두 번째 반전"],
          topGeneralCandidates: ["두 번째 설명", "두 번째 상황", "두 번째 질문"],
          enabled: false,
          topHighlightText: "두 번째 강조",
          topGeneralText: "두 번째 설명",
          channelNameText: "예시 채널",
          titleText: "원본 제목",
        },
      ],
    });

    expect(request).toEqual({
      planId: "plan-001",
      videoPath: "/videos/source.mp4",
      originalTitle: "원본 제목",
      profileImagePath: "/images/channel.png",
      selections: [
        expect.objectContaining({
          id: "short-001",
          enabled: true,
          topHighlightText: "오늘의 작은 변화",
        }),
        expect.objectContaining({
          id: "short-002",
          enabled: false,
        }),
      ],
    });
  });

  it("builds a generation request with normalized ids from reviewed clips", () => {
    const reviewedClips = createReviewedClips({
      planId: "plan-001",
      source: {
        videoPath: "/videos/source.mp4",
        transcriptPath: "/transcripts/source.txt",
        channelName: "예시 채널",
        originalTitle: "원본 제목",
      },
      clips: [
        {
          id: "short-001",
          start: "00:01:09.366",
          end: "00:01:36.800",
          reason: "hook",
          topHighlightCandidates: ["오늘의 작은 변화", "바로 걸린다", "이건 못 참지"],
          topGeneralCandidates: [
            "작은 습관부터 시작해 보세요",
            "괜히 내가 나빠짐",
            "말해줘야 하나",
          ],
        },
        {
          id: "short-001",
          start: "00:02:10.000",
          end: "00:02:22.500",
          reason: "duplicate hook",
          topHighlightCandidates: ["두 번째 강조", "두 번째 반전", "두 번째 훅"],
          topGeneralCandidates: ["두 번째 본문", "두 번째 설명", "두 번째 상황"],
        },
      ],
    });

    const request = buildGenerationRequest({
      planId: "plan-001",
      videoPath: "/videos/source.mp4",
      originalTitle: "원본 제목",
      clips: reviewedClips,
    });

    expect(request.selections.map((selection) => selection.id)).toEqual([
      "short-001",
      "short-001-2",
    ]);
  });
});
