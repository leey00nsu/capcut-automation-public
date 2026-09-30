import { basename, dirname } from "node:path";

import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";
import type { MediaFileMetadata } from "@/lib/media/file-metadata";

type CapCutDraftMetaMaterial = {
  id?: string;
  metetype?: string;
  file_Path?: string;
  extra_info?: string;
  create_time?: number;
  import_time?: number;
  import_time_ms?: number;
  duration?: number;
  roughcut_time_range?: {
    start?: number;
    duration?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type CapCutDraftMetaMaterialsGroup = {
  type?: number;
  value?: CapCutDraftMetaMaterial[];
  [key: string]: unknown;
};

export type CapCutDraftMetaInfo = {
  draft_id?: string;
  draft_name?: string;
  draft_fold_path?: string;
  draft_root_path?: string;
  draft_timeline_materials_size_?: number;
  tm_draft_create?: number;
  tm_draft_modified?: number;
  tm_duration?: number;
  draft_materials?: CapCutDraftMetaMaterialsGroup[];
  [key: string]: unknown;
};

export type CapCutDraftAgencyConfig = {
  marterials?: Array<{
    source_path?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type PatchDraftSupportFilesInput = {
  outputProjectPath: string;
  videoPath: string;
  projectName: string;
  profileImagePath: string;
  videoMetadata: MediaFileMetadata;
  profileImageMetadata: MediaFileMetadata;
  clipDuration: number;
  timelineMaterialsSize: number;
  now?: Date;
};

const PLACEHOLDER_META_ID = "cd484075-d92a-4bc9-b45c-d093d2f9e71b";
const PLACEHOLDER_DURATION = 33_333;

function toUnixSeconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

function toUnixMicroseconds(now: Date): number {
  return now.getTime() * 1000;
}

export function patchDraftMetaInfo(
  draftMetaInfo: CapCutDraftMetaInfo,
  input: PatchDraftSupportFilesInput,
): CapCutDraftMetaInfo {
  const now = input.now ?? new Date();
  const unixSeconds = toUnixSeconds(now);
  const unixMicroseconds = toUnixMicroseconds(now);
  const nextDraftMetaInfo = structuredClone(draftMetaInfo);
  const nextDraftMaterials = [...(nextDraftMetaInfo.draft_materials ?? [])];
  const existingTypeZeroMaterials =
    nextDraftMaterials.find((materialGroup) => materialGroup.type === 0)?.value ?? [];

  const buildVideoMaterial = (): CapCutDraftMetaMaterial => {
    const existingMaterial = existingTypeZeroMaterials.find(
      (material) => material.metetype === "video",
    );
    const duration = input.videoMetadata.durationUnits ?? existingMaterial?.duration ?? 0;

    return {
      ...existingMaterial,
      ai_group_type:
        typeof existingMaterial?.ai_group_type === "string"
          ? existingMaterial.ai_group_type
          : "",
      create_time:
        typeof existingMaterial?.create_time === "number"
          ? existingMaterial.create_time
          : -1,
      duration,
      enter_from:
        typeof existingMaterial?.enter_from === "number"
          ? existingMaterial.enter_from
          : 0,
      extra_info: basename(input.videoPath),
      file_Path: input.videoPath,
      height: input.videoMetadata.height,
      id: existingMaterial?.id ?? CAPCUT_SLOT_MAP.mainVideoSegmentMaterialId,
      import_time:
        typeof existingMaterial?.import_time === "number"
          ? existingMaterial.import_time
          : -1,
      import_time_ms:
        typeof existingMaterial?.import_time_ms === "number"
          ? existingMaterial.import_time_ms
          : -1,
      item_source:
        typeof existingMaterial?.item_source === "number"
          ? existingMaterial.item_source
          : 1,
      md5: typeof existingMaterial?.md5 === "string" ? existingMaterial.md5 : "",
      metetype: "video",
      roughcut_time_range: {
        ...(existingMaterial?.roughcut_time_range ?? {}),
        start: 0,
        duration,
      },
      sub_time_range: {
        ...(typeof existingMaterial?.sub_time_range === "object" &&
        existingMaterial.sub_time_range
          ? existingMaterial.sub_time_range
          : {}),
        start: -1,
        duration: -1,
      },
      type: 0,
      width: input.videoMetadata.width,
    } satisfies CapCutDraftMetaMaterial;
  };

  const buildPhotoMaterial = (): CapCutDraftMetaMaterial => {
    const existingMaterial = existingTypeZeroMaterials.find(
      (material) => material.metetype === "photo",
    );
    const duration =
      existingMaterial?.duration ?? input.profileImageMetadata.durationUnits ?? 5_000_000;

    return {
      ...existingMaterial,
      ai_group_type:
        typeof existingMaterial?.ai_group_type === "string"
          ? existingMaterial.ai_group_type
          : "",
      create_time: unixSeconds,
      duration,
      enter_from:
        typeof existingMaterial?.enter_from === "number"
          ? existingMaterial.enter_from
          : 0,
      extra_info: basename(input.profileImagePath),
      file_Path: input.profileImagePath,
      height: input.profileImageMetadata.height,
      id: existingMaterial?.id ?? crypto.randomUUID(),
      import_time: unixSeconds,
      import_time_ms: unixMicroseconds,
      item_source:
        typeof existingMaterial?.item_source === "number"
          ? existingMaterial.item_source
          : 1,
      md5: typeof existingMaterial?.md5 === "string" ? existingMaterial.md5 : "",
      metetype: "photo",
      roughcut_time_range: {
        ...(existingMaterial?.roughcut_time_range ?? {}),
        start: -1,
        duration: -1,
      },
      sub_time_range: {
        ...(typeof existingMaterial?.sub_time_range === "object" &&
        existingMaterial.sub_time_range
          ? existingMaterial.sub_time_range
          : {}),
        start: -1,
        duration: -1,
      },
      type: 0,
      width: input.profileImageMetadata.width,
    } satisfies CapCutDraftMetaMaterial;
  };

  const buildPlaceholderMaterial = (): CapCutDraftMetaMaterial => {
    const existingMaterial = existingTypeZeroMaterials.find(
      (material) =>
        material.metetype === "none" ||
        material.id === PLACEHOLDER_META_ID ||
        material.file_Path === "",
    );
    const duration = existingMaterial?.duration ?? PLACEHOLDER_DURATION;

    return {
      ...existingMaterial,
      ai_group_type:
        typeof existingMaterial?.ai_group_type === "string"
          ? existingMaterial.ai_group_type
          : "",
      create_time: unixSeconds,
      duration,
      enter_from:
        typeof existingMaterial?.enter_from === "number"
          ? existingMaterial.enter_from
          : 0,
      extra_info: "",
      file_Path: "",
      height: 0,
      id: existingMaterial?.id ?? PLACEHOLDER_META_ID,
      import_time: unixSeconds,
      import_time_ms: unixMicroseconds,
      item_source:
        typeof existingMaterial?.item_source === "number"
          ? existingMaterial.item_source
          : 1,
      md5: typeof existingMaterial?.md5 === "string" ? existingMaterial.md5 : "",
      metetype: "none",
      roughcut_time_range: {
        ...(existingMaterial?.roughcut_time_range ?? {}),
        start: 0,
        duration,
      },
      sub_time_range: {
        ...(typeof existingMaterial?.sub_time_range === "object" &&
        existingMaterial.sub_time_range
          ? existingMaterial.sub_time_range
          : {}),
        start: -1,
        duration: -1,
      },
      type: 0,
      width: 0,
    } satisfies CapCutDraftMetaMaterial;
  };

  const nextTypeZeroMaterials = [
    buildVideoMaterial(),
    buildPhotoMaterial(),
    buildPlaceholderMaterial(),
  ];

  nextDraftMetaInfo.draft_name = input.projectName;
  nextDraftMetaInfo.draft_id = crypto.randomUUID().toUpperCase();
  nextDraftMetaInfo.draft_fold_path = input.outputProjectPath;
  nextDraftMetaInfo.draft_root_path = dirname(input.outputProjectPath);
  nextDraftMetaInfo.draft_timeline_materials_size_ = input.timelineMaterialsSize;
  nextDraftMetaInfo.tm_draft_create = unixMicroseconds;
  nextDraftMetaInfo.tm_draft_modified = unixMicroseconds;
  nextDraftMetaInfo.tm_duration = input.clipDuration;
  nextDraftMetaInfo.draft_materials = nextDraftMaterials.map((materialGroup) => {
    if (materialGroup.type === 0) {
      return {
        ...materialGroup,
        value: nextTypeZeroMaterials,
      };
    }

    return materialGroup;
  });

  if (!nextDraftMetaInfo.draft_materials.some((materialGroup) => materialGroup.type === 0)) {
    nextDraftMetaInfo.draft_materials.push({
      type: 0,
      value: nextTypeZeroMaterials,
    });
  }

  return nextDraftMetaInfo;
}

export function patchDraftAgencyConfig(
  draftAgencyConfig: CapCutDraftAgencyConfig,
  input: Pick<PatchDraftSupportFilesInput, "profileImagePath">,
): CapCutDraftAgencyConfig {
  const nextDraftAgencyConfig = structuredClone(draftAgencyConfig);

  for (const material of nextDraftAgencyConfig.marterials ?? []) {
    if (typeof material.source_path === "string") {
      material.source_path = input.profileImagePath;
    }
  }

  return nextDraftAgencyConfig;
}

export type CapCutDraftVirtualStore = {
  draft_virtual_store?: Array<{
    type?: number;
    value?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export function patchDraftVirtualStore(
  draftVirtualStore: CapCutDraftVirtualStore,
  input: {
    mediaMaterialIds: string[];
  },
): CapCutDraftVirtualStore {
  const nextDraftVirtualStore = structuredClone(draftVirtualStore);
  const nextTypeOneValue = input.mediaMaterialIds
    .filter((mediaMaterialId) => mediaMaterialId.length > 0)
    .map((mediaMaterialId) => ({
      child_id: mediaMaterialId,
      parent_id: "",
    }));

  nextDraftVirtualStore.draft_virtual_store = (
    nextDraftVirtualStore.draft_virtual_store ?? []
  ).map((entry) => {
    if (entry.type === 1) {
      return {
        ...entry,
        value: nextTypeOneValue,
      };
    }

    return entry;
  });

  if (
    !nextDraftVirtualStore.draft_virtual_store.some((entry) => entry.type === 1)
  ) {
    nextDraftVirtualStore.draft_virtual_store.push({
      type: 1,
      value: nextTypeOneValue,
    });
  }

  return nextDraftVirtualStore;
}
