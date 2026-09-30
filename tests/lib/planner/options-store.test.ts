import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLANNER_OPTIONS } from "@/lib/planner/options";
import {
  getPlannerOptionsFilePath,
  loadPlannerOptions,
  savePlannerOptions,
} from "@/lib/planner/options-store";

const createdPaths: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    createdPaths.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("planner options JSON store", () => {
  it("stores editable preferences in the configured data directory", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "planner-data-root-"));
    createdPaths.push(rootDirectory);
    vi.stubEnv("CAPCUT_AUTOMATION_DATA_ROOT", rootDirectory);
    const edited = { ...DEFAULT_PLANNER_OPTIONS, promptInstructions: "사용자 편집 지침" };
    await savePlannerOptions(edited);
    expect(getPlannerOptionsFilePath()).toBe(join(rootDirectory, "config", "planner-options.json"));
    expect(await loadPlannerOptions()).toEqual(edited);
  });
  it("persists prompt and few-shot edits to JSON and restores them", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "planner-options-"));
    createdPaths.push(rootDirectory);
    const edited = {
      ...DEFAULT_PLANNER_OPTIONS,
      promptInstructions: "JSON에 저장한 프롬프트",
      fewShotExamples: [
        { highlight: "저장 강조", general: "저장 일반" },
      ],
    };

    await savePlannerOptions(edited, rootDirectory);

    expect(await loadPlannerOptions(rootDirectory)).toEqual(edited);
    const json = JSON.parse(
      await readFile(getPlannerOptionsFilePath(rootDirectory), "utf8"),
    );
    expect(json).toMatchObject({
      promptInstructions: "JSON에 저장한 프롬프트",
      fewShotExamples: [
        { highlight: "저장 강조", general: "저장 일반" },
      ],
    });
  });
});
