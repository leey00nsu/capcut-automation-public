import type { PlannerModel, PlannerProvider } from "@/types/planner";

export const PLANNER_MODELS = [
  "gpt-6.1-sol",
  "gpt-5.6-sol",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
] as const satisfies readonly PlannerModel[];

type PlannerModelOption = {
  value: PlannerModel;
  label: string;
};

export const PROVIDER_MODEL_OPTIONS: Record<
  PlannerProvider,
  readonly PlannerModelOption[]
> = {
  codex: [
    { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  ],
  openai: [
    { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { value: "gpt-5.4-nano", label: "GPT-5.4 nano" },
  ],
};

const DEFAULT_PROVIDER_MODEL: Record<PlannerProvider, PlannerModel> = {
  codex: "gpt-6.1-sol",
  openai: "gpt-6.1-sol",
};

export function getDefaultPlannerModel(provider: PlannerProvider): PlannerModel {
  return DEFAULT_PROVIDER_MODEL[provider];
}

export function isModelSupportedForProvider(
  provider: PlannerProvider,
  model: PlannerModel,
): boolean {
  return PROVIDER_MODEL_OPTIONS[provider].some((option) => option.value === model);
}
