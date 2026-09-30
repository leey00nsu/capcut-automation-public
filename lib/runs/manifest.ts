import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectGenerationFailure, ProjectGenerationRequest, ProjectGenerationResult } from "@/types/project";

export type RunManifest = {
  runId: string;
  createdAt: string;
  request: ProjectGenerationRequest;
  projects: ProjectGenerationResult["projects"];
  failures: ProjectGenerationFailure[];
};

export async function writeRunManifest(
  manifest: RunManifest,
  rootDirectory = process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd(),
): Promise<string> {
  const runsDirectory = join(rootDirectory, "runs");
  const manifestPath = join(runsDirectory, `${manifest.runId}.json`);
  const tempManifestPath = join(
    runsDirectory,
    `${manifest.runId}.json.tmp-${crypto.randomUUID()}`,
  );

  await mkdir(runsDirectory, { recursive: true });
  await writeFile(tempManifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await rename(tempManifestPath, manifestPath);

  return manifestPath;
}
