import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DEFAULT_PLANNER_OPTIONS,
  parseStoredPlannerOptions,
  type PlannerOptions,
} from "@/lib/planner/options";

export function getPlannerOptionsFilePath(
  rootDirectory = process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd(),
): string {
  return join(rootDirectory, "config", "planner-options.json");
}

export async function loadPlannerOptions(
  rootDirectory = process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd(),
): Promise<PlannerOptions> {
  try {
    const contents = await readFile(
      getPlannerOptionsFilePath(rootDirectory),
      "utf8",
    );
    return parseStoredPlannerOptions(contents) ?? DEFAULT_PLANNER_OPTIONS;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return DEFAULT_PLANNER_OPTIONS;
    }

    throw error;
  }
}

export async function savePlannerOptions(
  options: PlannerOptions,
  rootDirectory = process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd(),
): Promise<PlannerOptions> {
  const parsed = parseStoredPlannerOptions(JSON.stringify(options));

  if (!parsed) {
    throw new Error("Invalid planner options");
  }

  const filePath = getPlannerOptionsFilePath(rootDirectory);
  const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  await mkdir(join(rootDirectory, "config"), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
  return parsed;
}
