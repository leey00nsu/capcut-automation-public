import { estimatePlanUsageCost } from "@/lib/ai/usage";
import type { ProviderPlanResult } from "@/lib/ai/provider-result";
import type { PlannerModel } from "@/types/planner";

function extractOutputText(responseBody: unknown): string {
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "output_text" in responseBody &&
    typeof responseBody.output_text === "string" &&
    responseBody.output_text.trim()
  ) {
    return responseBody.output_text.trim();
  }

  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    !("output" in responseBody) ||
    !Array.isArray(responseBody.output)
  ) {
    throw new Error("Responses API did not return output text");
  }

  const outputText = responseBody.output
    .flatMap((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("content" in item) ||
        !Array.isArray(item.content)
      ) {
        return [];
      }

      return item.content.flatMap((contentItem: unknown) => {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "type" in contentItem &&
          contentItem.type === "output_text" &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
        ) {
          return [contentItem.text];
        }

        return [];
      });
    })
    .join("")
    .trim();

  if (!outputText) {
    throw new Error("Responses API did not return output text");
  }

  return outputText;
}

function parsePlannerJson(rawOutput: string): unknown {
  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";

    throw new Error(`OpenAI returned invalid JSON: ${message}`);
  }
}

export async function planWithOpenAI(input: {
  apiKey: string;
  model: PlannerModel;
  prompt: string;
  jsonSchema: object;
}): Promise<ProviderPlanResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      input: input.prompt,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "planner_output",
          schema: input.jsonSchema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `OpenAI Responses API failed with ${response.status}: ${details}`,
    );
  }

  const responseBody = (await response.json()) as unknown;
  const outputText = extractOutputText(responseBody);
  const parsedOutput = parsePlannerJson(outputText);

  const usage =
    typeof responseBody === "object" &&
    responseBody !== null &&
    "usage" in responseBody &&
    typeof responseBody.usage === "object" &&
    responseBody.usage !== null
      ? estimatePlanUsageCost({
          provider: "openai",
          model: input.model,
          totalTokens:
            ("total_tokens" in responseBody.usage &&
            typeof responseBody.usage.total_tokens === "number"
              ? responseBody.usage.total_tokens
              : 0) ||
            (("input_tokens" in responseBody.usage &&
              typeof responseBody.usage.input_tokens === "number"
              ? responseBody.usage.input_tokens
              : 0) +
              ("output_tokens" in responseBody.usage &&
              typeof responseBody.usage.output_tokens === "number"
                ? responseBody.usage.output_tokens
                : 0)),
          ...("input_tokens" in responseBody.usage &&
          typeof responseBody.usage.input_tokens === "number"
            ? { inputTokens: responseBody.usage.input_tokens }
            : {}),
          ...("output_tokens" in responseBody.usage &&
          typeof responseBody.usage.output_tokens === "number"
            ? { outputTokens: responseBody.usage.output_tokens }
            : {}),
        })
      : undefined;

  return {
    output: parsedOutput,
    ...(usage ? { usage } : {}),
  };
}
