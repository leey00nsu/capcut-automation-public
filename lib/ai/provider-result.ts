import type { PlanUsage } from "@/types/planner";

export type ProviderPlanResult = {
  output: unknown;
  usage?: PlanUsage;
};
