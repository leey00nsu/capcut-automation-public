import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { readLatestCodexExecUsage } from "@/lib/ai/codex-usage";
import type { ProviderPlanResult } from "@/lib/ai/provider-result";
import type { PlannerModel } from "@/types/planner";

function parsePlannerJson(rawOutput: string): unknown {
  const normalizedOutput = rawOutput.trim();

  if (!normalizedOutput) {
    throw new Error("Codex returned an empty response");
  }

  try {
    return JSON.parse(normalizedOutput);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";

    throw new Error(`Codex returned invalid JSON: ${message}`);
  }
}

export function buildCodexExecArgs(input: {
  model: PlannerModel;
  schemaPath: string;
  outputPath: string;
}): string[] {
  return [
    "exec",
    "-c",
    "service_tier=\"fast\"",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--model",
    input.model,
    "--output-schema",
    input.schemaPath,
    "--output-last-message",
    input.outputPath,
    "-",
  ];
}

export async function planWithCodex(
  prompt: string,
  model: PlannerModel,
  jsonSchema: object,
): Promise<ProviderPlanResult> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-codex-"));
  const schemaPath = join(tempDirectory, "planner-output.schema.json");
  const outputPath = join(tempDirectory, "planner-output.json");
  const startedAtMs = Date.now();

  await writeFile(
    schemaPath,
    JSON.stringify(jsonSchema, null, 2),
    "utf8",
  );

  try {
    const { exitCode, stderr } = await new Promise<{
      exitCode: number | null;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        "codex",
        buildCodexExecArgs({ model, schemaPath, outputPath }),
        {
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

      let stderr = "";

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        resolve({ exitCode: code, stderr });
      });

      child.stdin.end(prompt);
    });

    if (exitCode !== 0) {
      const details = stderr.trim();
      throw new Error(
        details ? `Codex CLI failed: ${details}` : "Codex CLI failed",
      );
    }

    const rawOutput = await readFile(outputPath, "utf8");
    const output = parsePlannerJson(rawOutput);
    const usage = await readLatestCodexExecUsage({
      prompt,
      startedAtMs,
      model,
    });

    return {
      output,
      ...(usage ? { usage } : {}),
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
