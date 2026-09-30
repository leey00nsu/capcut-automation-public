import { describe, expect, it } from "vitest";

import { buildCodexExecArgs } from "@/lib/ai/codex";

describe("buildCodexExecArgs", () => {
  it("overrides the Codex service tier for planner exec calls", () => {
    expect(
      buildCodexExecArgs({
        model: "gpt-5.5",
        schemaPath: "/tmp/planner-output.schema.json",
        outputPath: "/tmp/planner-output.json",
      }),
    ).toEqual([
      "exec",
      "-c",
      "service_tier=\"fast\"",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--model",
      "gpt-5.5",
      "--output-schema",
      "/tmp/planner-output.schema.json",
      "--output-last-message",
      "/tmp/planner-output.json",
      "-",
    ]);
  });
});
