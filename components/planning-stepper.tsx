"use client";

import { Check, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type PlanningStepId =
  | "validate-input"
  | "create-session"
  | "transcribe-source"
  | "prepare-plan"
  | "await-ai"
  | "validate-response"
  | "prepare-review";

type PlanningStep = {
  id: PlanningStepId;
  label: string;
  description: string;
};

const PLANNING_STEPS: PlanningStep[] = [
  {
    id: "validate-input",
    label: "입력 확인",
    description: "필수 입력과 설정을 확인하고 있습니다.",
  },
  {
    id: "create-session",
    label: "세션 생성",
    description: "원본 영상 기준으로 작업 세션을 만들고 있습니다.",
  },
  {
    id: "transcribe-source",
    label: "전사 생성",
    description: "선택한 방식으로 전사 아티팩트를 만들고 있습니다.",
  },
  {
    id: "prepare-plan",
    label: "플랜 준비",
    description: "전사 결과와 후보 조건을 플래너 입력으로 정리하고 있습니다.",
  },
  {
    id: "await-ai",
    label: "AI 후보 생성",
    description: "AI가 쇼츠 후보와 상단 문구를 만들고 있습니다.",
  },
  {
    id: "validate-response",
    label: "결과 검증",
    description: "응답 형식과 길이 조건을 확인하고 있습니다.",
  },
  {
    id: "prepare-review",
    label: "후보 정리",
    description: "바로 검토할 수 있게 후보를 정리하고 있습니다.",
  },
];

type PlanningStepperProps = {
  currentStep: PlanningStepId;
};

export function PlanningStepper({ currentStep }: PlanningStepperProps) {
  const currentIndex = PLANNING_STEPS.findIndex((step) => step.id === currentStep);
  const current = PLANNING_STEPS[currentIndex] ?? PLANNING_STEPS[0];

  return (
    <div className="space-y-5">
      <ol className="grid gap-4 md:grid-cols-6" aria-label="쇼츠 후보 생성 단계">
        {PLANNING_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "relative rounded-2xl bg-surface-lowest/70 px-4 py-4 ring-1 ring-white/6 transition-colors",
                isCurrent && "bg-cyan-400/10 ring-cyan-300/30",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isCompleted &&
                      "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
                    isCurrent &&
                      "border-cyan-300/50 bg-cyan-300/18 text-cyan-50",
                    !isCompleted &&
                      !isCurrent &&
                      "border-white/10 bg-white/5 text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-4" />
                  ) : isCurrent ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold tracking-[-0.01em]",
                      isCurrent ? "text-foreground" : "text-muted-foreground",
                      isCompleted && "text-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl bg-surface-lowest/70 px-4 py-4 ring-1 ring-white/6">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-cyan-200 uppercase">
          현재 단계
        </p>
        <p className="mt-2 text-sm font-semibold tracking-[-0.01em] text-foreground">
          {current.label}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {current.description}
        </p>
      </div>
    </div>
  );
}
