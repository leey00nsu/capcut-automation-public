import { getDefaultPlannerModel, PROVIDER_MODEL_OPTIONS } from "@/lib/ai/models";
import {
  DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES,
  DEFAULT_PLANNER_PROMPT_INSTRUCTIONS,
} from "@/lib/ai/prompt";
import type {
  HookTextFewShotExample,
  PlannerProvider,
} from "@/types/planner";

export const PLANNER_OPTIONS_STORAGE_KEY = "capcut-automation-public.planner-options.v1";

export type PlannerOptions = {
  provider: PlannerProvider;
  model: string;
  modelOptions: Record<PlannerProvider, string[]>;
  defaultModels: Record<PlannerProvider, string>;
  promptInstructions: string;
  fewShotExamples: HookTextFewShotExample[];
};

function defaultModelIds(provider: PlannerProvider): string[] {
  return PROVIDER_MODEL_OPTIONS[provider].map((option) => option.value);
}

export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
  provider: "codex",
  model: getDefaultPlannerModel("codex"),
  modelOptions: {
    codex: defaultModelIds("codex"),
    openai: defaultModelIds("openai"),
  },
  defaultModels: {
    codex: getDefaultPlannerModel("codex"),
    openai: getDefaultPlannerModel("openai"),
  },
  promptInstructions: DEFAULT_PLANNER_PROMPT_INSTRUCTIONS,
  fewShotExamples: DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES.map((example) => ({
    ...example,
  })),
};

export function formatFewShotExamples(
  examples: readonly HookTextFewShotExample[],
): string {
  return examples
    .map((example) => `${example.highlight} | ${example.general}`)
    .join("\n");
}

export function parseFewShotExamples(
  value: string,
): HookTextFewShotExample[] | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.length > 500) {
    return null;
  }

  const examples = lines.map((line) => {
    const separatorIndex = line.indexOf("|");

    if (separatorIndex < 1) {
      return null;
    }

    const highlight = line.slice(0, separatorIndex).trim();
    const general = line.slice(separatorIndex + 1).trim();

    if (
      !highlight ||
      !general ||
      highlight.length > 200 ||
      general.length > 300
    ) {
      return null;
    }

    return { highlight, general };
  });

  return examples.every(
    (example): example is HookTextFewShotExample => example !== null,
  )
    ? examples
    : null;
}

function readFewShotExamples(value: unknown): HookTextFewShotExample[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    return null;
  }

  const examples = value.map((example) => {
    if (
      typeof example !== "object" ||
      example === null ||
      !("highlight" in example) ||
      typeof example.highlight !== "string" ||
      !("general" in example) ||
      typeof example.general !== "string"
    ) {
      return null;
    }

    const highlight = example.highlight.trim();
    const general = example.general.trim();

    return highlight &&
      general &&
      highlight.length <= 200 &&
      general.length <= 300
      ? { highlight, general }
      : null;
  });

  return examples.every(
    (example): example is HookTextFewShotExample => example !== null,
  )
    ? examples
    : null;
}

export function normalizeModelList(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

function readModelList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }

  const models = normalizeModelList(value);
  return models.length > 0 && models.every((model) => model.length <= 200)
    ? models
    : null;
}

export function parseStoredPlannerOptions(value: string | null): PlannerOptions | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("provider" in parsed) ||
      !("model" in parsed) ||
      !("promptInstructions" in parsed) ||
      (parsed.provider !== "codex" && parsed.provider !== "openai") ||
      typeof parsed.model !== "string" ||
      !parsed.model.trim() ||
      parsed.model.length > 200 ||
      typeof parsed.promptInstructions !== "string" ||
      parsed.promptInstructions.trim().length === 0
    ) {
      return null;
    }

    const storedModelOptions =
      "modelOptions" in parsed &&
      typeof parsed.modelOptions === "object" &&
      parsed.modelOptions !== null
        ? parsed.modelOptions
        : null;
    const codexModels = readModelList(
      storedModelOptions && "codex" in storedModelOptions
        ? storedModelOptions.codex
        : DEFAULT_PLANNER_OPTIONS.modelOptions.codex,
    );
    const openaiModels = readModelList(
      storedModelOptions && "openai" in storedModelOptions
        ? storedModelOptions.openai
        : DEFAULT_PLANNER_OPTIONS.modelOptions.openai,
    );

    if (!codexModels || !openaiModels) {
      return null;
    }

    const modelOptions = { codex: codexModels, openai: openaiModels };
    const fewShotExamples =
      "fewShotExamples" in parsed
        ? readFewShotExamples(parsed.fewShotExamples)
        : DEFAULT_PLANNER_OPTIONS.fewShotExamples;
    const storedDefaults =
      "defaultModels" in parsed &&
      typeof parsed.defaultModels === "object" &&
      parsed.defaultModels !== null
        ? parsed.defaultModels
        : null;
    const defaultModels = {
      codex:
        storedDefaults &&
        "codex" in storedDefaults &&
        typeof storedDefaults.codex === "string"
          ? storedDefaults.codex
          : parsed.provider === "codex"
            ? parsed.model
            : DEFAULT_PLANNER_OPTIONS.defaultModels.codex,
      openai:
        storedDefaults &&
        "openai" in storedDefaults &&
        typeof storedDefaults.openai === "string"
          ? storedDefaults.openai
          : parsed.provider === "openai"
            ? parsed.model
            : DEFAULT_PLANNER_OPTIONS.defaultModels.openai,
    };

    if (
      !fewShotExamples ||
      !modelOptions.codex.includes(defaultModels.codex) ||
      !modelOptions.openai.includes(defaultModels.openai) ||
      !modelOptions[parsed.provider].includes(parsed.model)
    ) {
      return null;
    }

    return {
      provider: parsed.provider,
      model: parsed.model,
      modelOptions,
      defaultModels,
      promptInstructions: parsed.promptInstructions,
      fewShotExamples,
    };
  } catch {
    return null;
  }
}
