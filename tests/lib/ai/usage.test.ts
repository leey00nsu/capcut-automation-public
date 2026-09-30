import { describe, expect, it } from "vitest";

import {
  estimatePlanUsageCost,
  formatUsdEstimate,
  formatUsageTokens,
} from "@/lib/ai/usage";

describe("usage cost estimation", () => {
  it("uses GPT-6.1 Sol pricing rather than falling back to another model", () => {
    const usage = estimatePlanUsageCost({
      provider: "openai", model: "gpt-6.1-sol", totalTokens: 2_000_000,
      inputTokens: 1_000_000, outputTokens: 1_000_000,
    });
    expect(usage.estimatedCostUsd).toBe(12);
  });
  it("uses exact input and output token counts when they are available", () => {
    const usage = estimatePlanUsageCost({
      provider: "openai",
      model: "gpt-5.4-mini",
      totalTokens: 3000,
      inputTokens: 2000,
      outputTokens: 1000,
    });

    expect(usage.estimatedCostUsd).toBe(0.006);
    expect(usage.costMode).toBe("actual_usage");
  });

  it("falls back to a rough blended estimate when only total tokens are known", () => {
    const usage = estimatePlanUsageCost({
      provider: "codex",
      model: "gpt-5.5",
      totalTokens: 123456,
      reasoningEffort: "high",
      threadId: "thread-codex-001",
    });

    expect(usage.costMode).toBe("rough_estimate");
    expect(usage.estimatedCostUsd).toBeCloseTo(1.08024, 5);
    expect(usage.note).toContain("85%");
  });

  it("uses GPT-5.6 Sol pricing", () => {
    const usage = estimatePlanUsageCost({
      provider: "codex",
      model: "gpt-5.6-sol",
      totalTokens: 2_000_000,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(usage.estimatedCostUsd).toBe(35);
    expect(usage.costMode).toBe("actual_usage");
  });

  it("supports nano pricing for OpenAI-only models", () => {
    const usage = estimatePlanUsageCost({
      provider: "openai",
      model: "gpt-5.4-nano",
      totalTokens: 10_000,
      inputTokens: 8_000,
      outputTokens: 2_000,
    });

    expect(usage.estimatedCostUsd).toBe(0.0041);
    expect(usage.costMode).toBe("actual_usage");
  });

  it("formats usage values for UI display", () => {
    expect(formatUsageTokens(123456)).toBe("123,456 tokens");
    expect(formatUsdEstimate(0.54)).toBe("~$0.54");
  });
});
