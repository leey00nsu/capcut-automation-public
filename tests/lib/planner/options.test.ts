import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLANNER_OPTIONS,
  formatFewShotExamples,
  parseFewShotExamples,
  parseStoredPlannerOptions,
} from "@/lib/planner/options";

describe("planner options", () => {
  it("restores a valid saved provider, model, and prompt", () => {
    const options = {
      ...DEFAULT_PLANNER_OPTIONS,
      provider: "openai" as const,
      model: "gpt-custom",
      modelOptions: {
        ...DEFAULT_PLANNER_OPTIONS.modelOptions,
        openai: ["gpt-custom", "gpt-backup"],
      },
      defaultModels: {
        ...DEFAULT_PLANNER_OPTIONS.defaultModels,
        openai: "gpt-custom",
      },
      promptInstructions: "웃긴 장면을 우선해라.",
    };

    expect(parseStoredPlannerOptions(JSON.stringify(options))).toEqual(options);
  });

  it("rejects corrupt options or defaults missing from the model list", () => {
    expect(parseStoredPlannerOptions("not-json")).toBeNull();
    expect(
      parseStoredPlannerOptions(
        JSON.stringify({
          ...DEFAULT_PLANNER_OPTIONS,
          defaultModels: {
            ...DEFAULT_PLANNER_OPTIONS.defaultModels,
            openai: "missing-model",
          },
        }),
      ),
    ).toBeNull();
  });

  it("migrates options saved before editable model lists were added", () => {
    const restored = parseStoredPlannerOptions(
      JSON.stringify({
        provider: "codex",
        model: "gpt-5.5",
        promptInstructions: "기존 프롬프트",
      }),
    );

    expect(restored).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      defaultModels: { codex: "gpt-5.5" },
    });
    expect(restored?.modelOptions.codex).toContain("gpt-5.5");
    expect(restored?.fewShotExamples).toHaveLength(6);
  });

  it("parses the editable few-shot line format", () => {
    const examples = parseFewShotExamples("강조 1 | 일반 1\n강조 2 | 일반 2");

    expect(examples).toEqual([
      { highlight: "강조 1", general: "일반 1" },
      { highlight: "강조 2", general: "일반 2" },
    ]);
    expect(formatFewShotExamples(examples ?? [])).toBe(
      "강조 1 | 일반 1\n강조 2 | 일반 2",
    );
    expect(parseFewShotExamples("구분자 없음")).toBeNull();
  });
});
