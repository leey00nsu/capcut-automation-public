import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES,
  buildHookTextFewShotPrompt,
  buildPlannerPrompt,
} from "@/lib/ai/prompt";
import type { PlannerPromptInput } from "@/types/planner";

function createPromptInput(
  overrides: Partial<PlannerPromptInput> = {},
): PlannerPromptInput {
  return {
    videoPath: "/videos/source.mp4",
    transcriptPath: "/transcripts/source.txt",
    channelName: "예시 채널",
    originalTitle: "테스트 영상",
    transcript: "[00:00:00.000 - 00:00:30.000] 테스트 전사",
    settings: {
      clipCount: 5,
      minClipDurationSeconds: 15,
      maxClipDurationSeconds: 30,
      subtitleCandidateCount: 3,
    },
    ...overrides,
  };
}

describe("planner prompt few-shot examples", () => {
  it("includes the generic format examples in the few-shot prompt", () => {
    const fewShotPrompt = buildHookTextFewShotPrompt(
      DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES,
    );

    expect(DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES).toHaveLength(6);
    expect(fewShotPrompt).toContain(
      '001. ["처음부터 완벽할 필요는", "작은 습관 하나로 시작하는 방법"]',
    );
    expect(fewShotPrompt).toContain(
      '["직접 비교해 보니", "두 제품의 차이가 보이는 순간"]',
    );
  });

  it("appends the few-shot examples without replacing saved instructions", () => {
    const savedInstructions = "인터뷰의 뜻밖의 반전을 우선해서 골라라.";
    const customExamples = [
      { highlight: "저장된 강조", general: "JSON에서 불러온 일반 문구" },
    ];
    const prompt = buildPlannerPrompt(
      createPromptInput({
        promptInstructions: savedInstructions,
        fewShotExamples: customExamples,
      }),
    );
    const fewShotPrompt = buildHookTextFewShotPrompt(customExamples);

    expect(prompt).toContain(savedInstructions);
    expect(prompt).toContain(fewShotPrompt);
    expect(prompt.indexOf(savedInstructions)).toBeLessThan(
      prompt.indexOf(fewShotPrompt),
    );
    expect(prompt.indexOf(fewShotPrompt)).toBeLessThan(
      prompt.indexOf("출력 규칙:"),
    );
  });
});
