import type { PlanUsage, PlannerProvider } from "@/types/planner";

const PRICING_REFERENCE = "https://openai.com/api/pricing";
const ROUGH_INPUT_WEIGHT = 0.85;
const ROUGH_OUTPUT_WEIGHT = 0.15;

const MODEL_PRICING = {
  "gpt-6.1-sol": {
    inputPerMillionUsd: 2,
    outputPerMillionUsd: 10,
  },
  "gpt-5.6-sol": {
    inputPerMillionUsd: 5,
    outputPerMillionUsd: 30,
  },
  "gpt-5.5": {
    inputPerMillionUsd: 5,
    outputPerMillionUsd: 30,
  },
  "gpt-5.4": {
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 15,
  },
  "gpt-5.4-mini": {
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 4.5,
  },
  "gpt-5.4-nano": {
    inputPerMillionUsd: 0.2,
    outputPerMillionUsd: 1.25,
  },
} as const;

function normalizePricingKey(model: string): keyof typeof MODEL_PRICING {
  const normalized = model.trim().toLowerCase();

  if (normalized.startsWith("gpt-6.1-sol")) {
    return "gpt-6.1-sol";
  }

  if (normalized.startsWith("gpt-5.6-sol")) {
    return "gpt-5.6-sol";
  }

  if (normalized.startsWith("gpt-5.5")) {
    return "gpt-5.5";
  }

  if (normalized.startsWith("gpt-5.4-nano")) {
    return "gpt-5.4-nano";
  }

  if (
    normalized.startsWith("gpt-5-mini") ||
    normalized.startsWith("gpt-5.4-mini")
  ) {
    return "gpt-5.4-mini";
  }

  return "gpt-5.4";
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

export function formatUsageTokens(totalTokens: number): string {
  return `${new Intl.NumberFormat("en-US").format(totalTokens)} tokens`;
}

export function formatUsdEstimate(estimatedCostUsd: number): string {
  return `~$${estimatedCostUsd.toFixed(2)}`;
}

export function estimatePlanUsageCost(input: {
  provider: PlannerProvider;
  model: string;
  totalTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningEffort?: string;
  threadId?: string;
}): PlanUsage {
  const pricingKey = normalizePricingKey(input.model);
  const pricing = MODEL_PRICING[pricingKey];

  if (
    typeof input.inputTokens === "number" &&
    typeof input.outputTokens === "number"
  ) {
    const estimatedCostUsd = roundUsd(
      (input.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
        (input.outputTokens / 1_000_000) * pricing.outputPerMillionUsd,
    );

    return {
      provider: input.provider,
      model: input.model,
      totalTokens: input.totalTokens,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd,
      pricingReference: PRICING_REFERENCE,
      costMode: "actual_usage",
      note: "OpenAI API usage 필드를 기준으로 계산한 대략적인 비용입니다.",
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    };
  }

  const blendedPerMillionUsd =
    pricing.inputPerMillionUsd * ROUGH_INPUT_WEIGHT +
    pricing.outputPerMillionUsd * ROUGH_OUTPUT_WEIGHT;
  const estimatedCostUsd = roundUsd(
    (input.totalTokens / 1_000_000) * blendedPerMillionUsd,
  );

  return {
    provider: input.provider,
    model: input.model,
    totalTokens: input.totalTokens,
    estimatedCostUsd,
    pricingReference: PRICING_REFERENCE,
    costMode: "rough_estimate",
    note:
      "선택된 모델의 API 단가와 입력 85% / 출력 15% 가정에 따른 환산 추정치입니다. OAuth 구독의 실제 청구 금액이 아닙니다.",
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}
