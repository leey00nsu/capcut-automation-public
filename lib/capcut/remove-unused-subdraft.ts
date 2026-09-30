import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CapCutDraftMetaInfo } from "@/lib/capcut/patch-draft-support-files";

const UNUSED_COMBINATION_META_TYPE = 18;
const SUBDRAFT_DIRECTORY_NAME = "subdraft";

type CapCutDraftMetaMaterial = {
  metetype?: string;
  file_Path?: string;
};

function isUnusedSubdraftMaterial(material: CapCutDraftMetaMaterial): boolean {
  return (
    material.metetype === "combination" &&
    typeof material.file_Path === "string" &&
    material.file_Path.includes("/sub_draft_config.json")
  );
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function stripCombinationEntries(
  draftMetaInfo: CapCutDraftMetaInfo,
): {
  nextDraftMetaInfo: CapCutDraftMetaInfo;
  removed: boolean;
} {
  const nextDraftMetaInfo = structuredClone(draftMetaInfo);
  let removed = false;

  nextDraftMetaInfo.draft_materials = (nextDraftMetaInfo.draft_materials ?? []).map(
    (group) => {
      if (group.type !== UNUSED_COMBINATION_META_TYPE) {
        return group;
      }

      const value = Array.isArray(group.value) ? group.value : [];
      const nextValue = value.filter((material) => !isUnusedSubdraftMaterial(material));

      if (nextValue.length === value.length) {
        return group;
      }

      removed = true;

      return {
        ...group,
        value: nextValue,
      };
    },
  );

  return {
    nextDraftMetaInfo,
    removed,
  };
}

export async function removeUnusedSubdraftArtifacts(
  projectPath: string,
): Promise<void> {
  const draftMetaInfoPath = join(projectPath, "draft_meta_info.json");

  await access(draftMetaInfoPath);

  const draftMetaInfo = await readJsonFile<CapCutDraftMetaInfo>(draftMetaInfoPath);
  const { nextDraftMetaInfo, removed } = stripCombinationEntries(draftMetaInfo);

  if (removed) {
    await writeJsonFile(draftMetaInfoPath, nextDraftMetaInfo);
  }

  await rm(join(projectPath, SUBDRAFT_DIRECTORY_NAME), {
    recursive: true,
    force: true,
  });
}
