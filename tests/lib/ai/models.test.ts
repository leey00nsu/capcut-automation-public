import { describe, expect, it } from "vitest";

import {
  PROVIDER_MODEL_OPTIONS,
  getDefaultPlannerModel,
  isModelSupportedForProvider,
} from "@/lib/ai/models";

describe("Codex planner models", () => {
  it("offers GPT-6.1 Sol and uses it as the default for both providers", () => {
    for (const provider of ["codex", "openai"] as const) {
      expect(PROVIDER_MODEL_OPTIONS[provider]).toContainEqual({
        value: "gpt-6.1-sol", label: "GPT-6.1 Sol",
      });
      expect(getDefaultPlannerModel(provider)).toBe("gpt-6.1-sol");
      expect(isModelSupportedForProvider(provider, "gpt-6.1-sol")).toBe(true);
    }
  });
  it("offers GPT-5.6 Sol as a selectable Codex model", () => {
    const model = "gpt-5.6-sol";

    expect(PROVIDER_MODEL_OPTIONS.codex).toContainEqual({
      value: model,
      label: "GPT-5.6 Sol",
    });
    expect(isModelSupportedForProvider("codex", model)).toBe(true);
  });
});
