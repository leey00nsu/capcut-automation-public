import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { cloneTemplateProject } from "@/lib/capcut/clone-template";
import {
  getCapCutProjectsRootPath,
  getDefaultChannelImagePath,
  getTemplateFontPath,
} from "@/lib/capcut/template-defaults";
import { patchTemplateFontPaths } from "@/lib/capcut/template-font";
import { addTranscriptSubtitles } from "@/lib/capcut/subtitles";
import { parseTranscriptCues, type SubtitleCue } from "@/lib/subtitles/cues";
import { subtitleStyleSchema, type SubtitleStyle } from "@/lib/subtitles/style";
import { readSubtitleFont } from "@/lib/subtitles/render";
import {
  patchDraftInfo,
  type CapCutDraftInfo,
} from "@/lib/capcut/patch-draft-info";
import {
  patchDraftAgencyConfig,
  patchDraftMetaInfo,
  patchDraftVirtualStore,
  type CapCutDraftAgencyConfig,
  type CapCutDraftMetaInfo,
  type CapCutDraftVirtualStore,
} from "@/lib/capcut/patch-draft-support-files";
import { getBuiltInTemplateProjectPath } from "@/lib/capcut/template-project";
import { timecodeToCapCutUnits } from "@/lib/capcut/time";
import {
  ensureExistingDirectoryPath,
  ensureReadableFilePath,
} from "@/lib/files/paths";
import { getMediaFileMetadata, type MediaFileMetadata } from "@/lib/media/file-metadata";
import { writeRunManifest } from "@/lib/runs/manifest";
import type {
  GeneratedProject,
  ProjectGenerationFailure,
  ProjectGenerationResult,
  ProjectSelection,
  ReviewedSelection,
} from "@/types/project";

export const runtime = "nodejs";

const timecodeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}\.\d{3}$/, "Time must use HH:MM:SS.mmm format");

const enabledSelectionSchema: z.ZodType<ReviewedSelection> = z
  .object({
    id: z.string().trim().min(1, "selection id is required"),
    enabled: z.literal(true),
    start: timecodeSchema,
    end: timecodeSchema,
    topHighlightText: z
      .string()
      .trim()
      .min(1, "topHighlightText is required"),
    topGeneralText: z.string().trim().min(1, "topGeneralText is required"),
    channelNameText: z.string().trim().min(1, "channelNameText is required"),
    titleText: z.string().trim().min(1, "titleText is required"),
  })
  .passthrough()
  .superRefine((value, context) => {
    let startUnits: number;
    let endUnits: number;

    try {
      startUnits = timecodeToCapCutUnits(value.start);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error ? error.message : "Invalid start timecode",
        path: ["start"],
      });
      return;
    }

    try {
      endUnits = timecodeToCapCutUnits(value.end);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid end timecode",
        path: ["end"],
      });
      return;
    }

    if (endUnits <= startUnits) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Selection ${value.id.trim() || "(unknown)"} must satisfy start < end`,
        path: ["end"],
      });
    }
  });

const disabledSelectionSchema: z.ZodType<Extract<ProjectSelection, { enabled: false }>> =
  z
    .object({
      id: z.string().trim().min(1, "selection id is required"),
      enabled: z.literal(false),
      start: z.string(),
      end: z.string(),
      topHighlightText: z.string(),
      topGeneralText: z.string(),
      channelNameText: z.string(),
      titleText: z.string(),
    })
    .partial({
      start: true,
      end: true,
      topHighlightText: true,
      topGeneralText: true,
      channelNameText: true,
      titleText: true,
    });

const requestSelectionSchema: z.ZodType<ProjectSelection> = z.union([
  enabledSelectionSchema,
  disabledSelectionSchema,
]);

const requestSchema = z.object({
  planId: z.string().trim().min(1, "planId is required"),
  videoPath: z.string().trim().min(1, "videoPath is required"),
  originalTitle: z.string().trim().min(1, "originalTitle is required"),
  profileImagePath: z.string().optional(),
  transcriptPath: z.string().optional(),
  subtitleStyle: subtitleStyleSchema.optional(),
  selections: z.array(requestSelectionSchema).min(1, "At least one selection is required"),
});

type ParsedGenerationRequest = z.infer<typeof requestSchema>;

type ValidatedGenerationRequest = ParsedGenerationRequest & {
  templateProjectPath: string;
  capCutProjectsRootPath: string;
  profileImagePath: string;
  videoMetadata: MediaFileMetadata;
  profileImageMetadata: MediaFileMetadata;
  enabledSelections: ReviewedSelection[];
  subtitleCues: SubtitleCue[];
  subtitleFontPath: string;
};

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function normalizeRequest(input: ParsedGenerationRequest): ParsedGenerationRequest {
  return {
    ...input,
    planId: input.planId.trim(),
    videoPath: input.videoPath.trim(),
    originalTitle: input.originalTitle.trim(),
    profileImagePath: input.profileImagePath?.trim(),
    selections: input.selections.map((selection) => ({
      ...selection,
      id: selection.id.trim(),
    })),
  };
}

function normalizeFilePath(value: string): string {
  return value.normalize("NFC");
}

function assertUniqueSelectionIds(
  selections: ParsedGenerationRequest["selections"],
): void {
  const seenSelectionIds = new Set<string>();

  for (const selection of selections) {
    if (seenSelectionIds.has(selection.id)) {
      throw new Error("Selection IDs must be unique");
    }

    seenSelectionIds.add(selection.id);
  }
}

function validateEnabledSelection(
  selection: ParsedGenerationRequest["selections"][number],
): ReviewedSelection {
  const parsedSelection = enabledSelectionSchema.safeParse(selection);

  if (!parsedSelection.success) {
    throw new Error(
      parsedSelection.error.issues[0]?.message ?? "Invalid selection",
    );
  }

  return parsedSelection.data;
}

async function parseRequest(request: Request): Promise<ValidatedGenerationRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  const normalized = normalizeRequest(parsed.data);
  assertUniqueSelectionIds(normalized.selections);

  const enabledSelections = normalized.selections
    .filter((selection) => selection.enabled)
    .map(validateEnabledSelection);

  if (enabledSelections.length === 0) {
    throw new Error("At least one enabled selection is required");
  }

  const builtInTemplateProjectPath = getBuiltInTemplateProjectPath();
  const capCutProjectsRoot = getCapCutProjectsRootPath();

  const [videoPath, templateProjectPath, capCutProjectsRootPath] =
    await Promise.all([
      ensureReadableFilePath(normalized.videoPath, "video path"),
      ensureExistingDirectoryPath(
        builtInTemplateProjectPath,
        "built-in template project path",
      ),
      ensureExistingDirectoryPath(capCutProjectsRoot, "CapCut projects root path"),
    ]);
  const profileImagePath = normalized.profileImagePath?.trim()
    ? await ensureReadableFilePath(normalized.profileImagePath, "profile image path")
    : await ensureReadableFilePath(
        getDefaultChannelImagePath(),
        "default profile image path",
      );

  await readDraftInfoFile(
    join(templateProjectPath, "draft_info.json"),
    "template draft_info.json",
  );

  await ensureReadableFilePath(getTemplateFontPath(), "template font path");

  let subtitleCues: SubtitleCue[] = [];
  let subtitleFontPath = getTemplateFontPath();
  if (normalized.subtitleStyle?.enabled) {
    const transcriptPath = await ensureReadableFilePath(normalized.transcriptPath ?? "", "transcript path");
    subtitleCues = parseTranscriptCues(await readFile(transcriptPath, "utf8"));
    if (normalized.subtitleStyle.fontSource === "local") {
      const fontPath = normalized.subtitleStyle.fontPath.trim();
      if (!/\.(otf|ttf)$/i.test(fontPath)) throw new Error("로컬 폰트는 OTF 또는 TTF 파일을 선택하세요.");
      subtitleFontPath = await ensureReadableFilePath(fontPath, "subtitle font path");
    }
    await readSubtitleFont(subtitleFontPath);
  }

  const [videoMetadata, profileImageMetadata] = await Promise.all([
    getMediaFileMetadata(videoPath),
    getMediaFileMetadata(profileImagePath),
  ]);

  return {
    ...normalized,
    videoPath: normalizeFilePath(videoPath),
    templateProjectPath,
    capCutProjectsRootPath,
    profileImagePath: normalizeFilePath(profileImagePath),
    videoMetadata,
    profileImageMetadata,
    enabledSelections,
    subtitleCues,
    subtitleFontPath,
  };
}

async function readDraftInfoFile(
  draftInfoPath: string,
  label: string,
): Promise<CapCutDraftInfo> {
  const rawDraftInfo = await readFile(
    await ensureReadableFilePath(draftInfoPath, label),
    "utf8",
  );

  try {
    return JSON.parse(rawDraftInfo) as CapCutDraftInfo;
  } catch {
    throw new Error(`${label} is not valid JSON: ${draftInfoPath}`);
  }
}

async function readJsonFile<T>(filePath: string, label: string): Promise<T> {
  const raw = await readFile(await ensureReadableFilePath(filePath, label), "utf8");

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

async function listProjectDataFiles(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(rootDirectory, entry.name);

      if (entry.isDirectory()) {
        return listProjectDataFiles(fullPath);
      }

      return entry.isFile() &&
        (entry.name.endsWith(".json") || entry.name.endsWith(".tmp") || entry.name.endsWith(".json.bak"))
        ? [fullPath]
        : [];
    }),
  );

  return files.flat();
}

function replaceProjectMediaReferences(
  value: unknown,
  options: {
    pathReplacements: Map<string, string>;
    basenameReplacements: Map<string, string>;
    uuidReplacements: Map<string, string>;
    videoPath: string;
    videoMetadata: MediaFileMetadata;
    videoLocalMaterialId?: string;
    profileImagePath: string;
    profileImageMetadata: MediaFileMetadata;
    currentKey?: string;
  },
): unknown {
  if (typeof value === "string") {
    if (options.uuidReplacements.has(value)) {
      return options.uuidReplacements.get(value);
    }

    if (options.pathReplacements.has(value)) {
      return options.pathReplacements.get(value);
    }

    if (options.basenameReplacements.has(value)) {
      return options.basenameReplacements.get(value);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceProjectMediaReferences(item, {
        ...options,
        currentKey: undefined,
      }),
    );
  }

  if (value && typeof value === "object") {
    const nextValue = Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        replaceProjectMediaReferences(entryValue, {
          ...options,
          currentKey: key,
        }),
      ]),
    );

    return applyMediaReferenceOverrides(nextValue, options);
  }

  return value;
}

function applyMediaReferenceOverrides(
  value: Record<string, unknown>,
  options: {
    videoPath: string;
    videoMetadata: MediaFileMetadata;
    videoLocalMaterialId?: string;
    profileImagePath: string;
    profileImageMetadata: MediaFileMetadata;
  },
): Record<string, unknown> {
  const mediaPath =
    typeof value.path === "string"
      ? value.path
      : typeof value.file_Path === "string"
        ? value.file_Path
        : null;

  if (mediaPath === options.videoPath) {
    const nextValue = { ...value };

    if (typeof nextValue.duration === "number" && options.videoMetadata.durationUnits) {
      nextValue.duration = options.videoMetadata.durationUnits;
    }
    if (typeof nextValue.width === "number") {
      nextValue.width = options.videoMetadata.width;
    }
    if (typeof nextValue.height === "number") {
      nextValue.height = options.videoMetadata.height;
    }
    if (typeof nextValue.has_audio === "boolean") {
      nextValue.has_audio = options.videoMetadata.hasAudio;
    }
    if (typeof nextValue.material_name === "string") {
      nextValue.material_name = basename(options.videoPath);
    }
    if (typeof nextValue.extra_info === "string") {
      nextValue.extra_info = basename(options.videoPath);
    }
    if (typeof nextValue.category_name === "string") {
      nextValue.category_name = "local";
    }
    if (typeof nextValue.is_copyright === "boolean") {
      nextValue.is_copyright = false;
    }
    if (
      typeof nextValue.local_material_id === "string" &&
      options.videoLocalMaterialId
    ) {
      nextValue.local_material_id = options.videoLocalMaterialId;
    }
    if (
      nextValue.roughcut_time_range &&
      typeof nextValue.roughcut_time_range === "object" &&
      typeof (nextValue.roughcut_time_range as { duration?: unknown }).duration ===
        "number" &&
      options.videoMetadata.durationUnits
    ) {
      nextValue.roughcut_time_range = {
        ...(nextValue.roughcut_time_range as Record<string, unknown>),
        duration: options.videoMetadata.durationUnits,
      };
    }

    return nextValue;
  }

  if (mediaPath === options.profileImagePath) {
    const nextValue = { ...value };

    if (
      typeof nextValue.duration === "number" &&
      options.profileImageMetadata.durationUnits
    ) {
      nextValue.duration = options.profileImageMetadata.durationUnits;
    }
    if (typeof nextValue.width === "number") {
      nextValue.width = options.profileImageMetadata.width;
    }
    if (typeof nextValue.height === "number") {
      nextValue.height = options.profileImageMetadata.height;
    }
    if (typeof nextValue.has_audio === "boolean") {
      nextValue.has_audio = false;
    }
    if (typeof nextValue.material_name === "string") {
      nextValue.material_name = basename(options.profileImagePath);
    }
    if (typeof nextValue.extra_info === "string") {
      nextValue.extra_info = basename(options.profileImagePath);
    }
    if (typeof nextValue.category_name === "string") {
      nextValue.category_name = "local";
    }
    if (typeof nextValue.is_copyright === "boolean") {
      nextValue.is_copyright = false;
    }
    if (typeof nextValue.local_material_id === "string") {
      nextValue.local_material_id = "";
    }

    return nextValue;
  }

  return value;
}

function collectAbsoluteMediaPaths(value: unknown, paths: Set<string>): void {
  if (typeof value === "string") {
    if (
      value.startsWith("/") &&
      /\.(mp4|mov|m4v|mkv|png|jpe?g|webp|gif)$/i.test(value)
    ) {
      paths.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAbsoluteMediaPaths(item, paths);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entryValue of Object.values(value)) {
      collectAbsoluteMediaPaths(entryValue, paths);
    }
  }
}

function sanitizeProjectNamePart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "project";
}

function buildProjectName(
  originalTitle: string,
  index: number,
  selection: ReviewedSelection,
): string {
  const safeTitle = sanitizeProjectNamePart(originalTitle);
  const safeHighlight = sanitizeProjectNamePart(selection.topHighlightText);

  return `${safeTitle}-${safeHighlight}-${String(index + 1).padStart(2, "0")}`;
}

function isDestinationExistsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;

  return (
    error.message.startsWith("Destination project directory already exists:") ||
    code === "EEXIST" ||
    code === "ERR_FS_CP_EEXIST"
  );
}

function buildProjectNameCandidate(baseProjectName: string, suffix: number): string {
  return suffix === 0 ? baseProjectName : `${baseProjectName}-${suffix}`;
}

async function getOptionalFileSize(filePath: string | undefined): Promise<number | undefined> {
  if (!filePath) {
    return undefined;
  }

  try {
    return (await stat(filePath)).size;
  } catch {
    return undefined;
  }
}

function buildProjectMediaRelativePath(kind: "source" | "profile", filePath: string): string {
  return join("Resources", "capcut-automation-media", `${kind}-${basename(filePath)}`);
}

async function copyProjectMediaAsset(input: {
  sourcePath: string;
  stagingProjectPath: string;
  finalProjectPath: string;
  kind: "source" | "profile";
}): Promise<{
  finalPath: string;
  stagingPath: string;
}> {
  const relativePath = buildProjectMediaRelativePath(input.kind, input.sourcePath);
  const stagingPath = join(input.stagingProjectPath, relativePath);

  await mkdir(dirname(stagingPath), { recursive: true });
  await copyFile(input.sourcePath, stagingPath);

  return {
    finalPath: join(input.finalProjectPath, relativePath).normalize("NFC"),
    stagingPath,
  };
}

function calculateTimelineMaterialsSize(input: {
  existingTimelineMaterialsSize?: number;
  previousMediaSizes: Array<number | undefined>;
  nextMediaSizes: number[];
}): number {
  const nextMediaSize = input.nextMediaSizes.reduce((total, size) => total + size, 0);

  if (
    typeof input.existingTimelineMaterialsSize === "number" &&
    input.previousMediaSizes.every((size): size is number => typeof size === "number")
  ) {
    const previousMediaSize = input.previousMediaSizes.reduce(
      (total, size) => total + size,
      0,
    );
    const retainedTimelineSize = Math.max(
      input.existingTimelineMaterialsSize - previousMediaSize,
      0,
    );

    return retainedTimelineSize + nextMediaSize;
  }

  return nextMediaSize;
}

async function cloneProjectWithDeterministicSuffix(
  templateProjectPath: string,
  capCutProjectsRootPath: string,
  baseProjectName: string,
): Promise<{
  outputProjectPath: string;
  stagingProjectPath: string;
  stagingRootPath: string;
  projectName: string;
}> {
  for (let suffix = 0; ; suffix += 1) {
    const projectName = buildProjectNameCandidate(baseProjectName, suffix);
    const outputProjectPath = join(capCutProjectsRootPath, projectName);
    const stagingRootPath = await mkdtemp(
      join(dirname(capCutProjectsRootPath), ".capcut-automation-staging-"),
    );
    const stagingProjectPath = join(stagingRootPath, projectName);

    try {
      await stat(outputProjectPath);
      await rm(stagingRootPath, { recursive: true, force: true });
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await rm(stagingRootPath, { recursive: true, force: true });
        throw error;
      }
    }

    try {
      await cloneTemplateProject(templateProjectPath, stagingProjectPath);

      return {
        outputProjectPath,
        stagingProjectPath,
        stagingRootPath,
        projectName,
      };
    } catch (error) {
      await rm(stagingRootPath, { recursive: true, force: true });

      if (isDestinationExistsError(error)) {
        continue;
      }

      throw error;
    }
  }
}

async function patchProjectDraft(
  projectDirectoryPath: string,
  projectName: string,
  input: {
    finalProjectPath: string;
    videoPath: string;
    stagingVideoPath: string;
    profileImagePath: string;
    stagingProfileImagePath: string;
    videoMetadata: MediaFileMetadata;
    profileImageMetadata: MediaFileMetadata;
    selection: ReviewedSelection;
    templateProjectPath: string;
    subtitleStyle?: SubtitleStyle;
    subtitleCues: SubtitleCue[];
    subtitleFontPath: string;
  },
): Promise<void> {
  const draftInfoPath = join(projectDirectoryPath, "draft_info.json");
  const draftInfoBackupPath = join(projectDirectoryPath, "draft_info.json.bak");
  const draftMetaInfoPath = join(projectDirectoryPath, "draft_meta_info.json");
  const draftAgencyConfigPath = join(projectDirectoryPath, "draft_agency_config.json");
  const draftVirtualStorePath = join(projectDirectoryPath, "draft_virtual_store.json");
  const templateTmpPath = join(projectDirectoryPath, "template-2.tmp");
  const draftInfo = await readDraftInfoFile(draftInfoPath, "cloned draft_info.json");
  const draftMetaInfo = await readJsonFile<CapCutDraftMetaInfo>(
    draftMetaInfoPath,
    "cloned draft_meta_info.json",
  );
  const draftAgencyConfig = await readJsonFile<CapCutDraftAgencyConfig>(
    draftAgencyConfigPath,
    "cloned draft_agency_config.json",
  );
  const draftVirtualStore = await readJsonFile<CapCutDraftVirtualStore>(
    draftVirtualStorePath,
    "cloned draft_virtual_store.json",
  );
  const mainVideoTemplatePath = draftInfo.materials.videos.find(
    (item) => item.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
  )?.path;
  const profileImageTemplatePath = draftInfo.materials.videos.find(
    (item) => item.id === "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622",
  )?.path;
  const nestedVideoLocalMaterialId = draftInfo.materials.videos.find(
    (item) => item.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
  )?.local_material_id;
  const clipStart = timecodeToCapCutUnits(input.selection.start);
  const clipEnd = timecodeToCapCutUnits(input.selection.end);
  const clipDuration = clipEnd - clipStart;

  if (clipDuration <= 0) {
    throw new Error(
      `Invalid clip range: ${input.selection.start} - ${input.selection.end}`,
    );
  }

  const now = new Date();
  const [
    videoFileSize,
    profileImageFileSize,
    templateVideoFileSize,
    templateProfileImageFileSize,
  ] = await Promise.all([
    getOptionalFileSize(input.stagingVideoPath),
    getOptionalFileSize(input.stagingProfileImagePath),
    getOptionalFileSize(mainVideoTemplatePath),
    getOptionalFileSize(profileImageTemplatePath),
  ]);
  const timelineMaterialsSize = calculateTimelineMaterialsSize({
    existingTimelineMaterialsSize: draftMetaInfo.draft_timeline_materials_size_,
    previousMediaSizes: [templateVideoFileSize, templateProfileImageFileSize],
    nextMediaSizes: [videoFileSize ?? 0, profileImageFileSize ?? 0],
  });
  const nextDraftMetaInfo = patchDraftMetaInfo(draftMetaInfo, {
    outputProjectPath: input.finalProjectPath,
    videoPath: input.videoPath,
    projectName,
    profileImagePath: input.profileImagePath,
    videoMetadata: input.videoMetadata,
    profileImageMetadata: input.profileImageMetadata,
    clipDuration,
    timelineMaterialsSize,
    now,
  });
  const typeZeroMaterials =
    nextDraftMetaInfo.draft_materials?.find((entry) => entry.type === 0)?.value ?? [];
  const placeholderMaterialId = typeZeroMaterials.find(
    (material) => material.metetype === "none",
  )?.id;
  const photoMaterialId = typeZeroMaterials.find(
    (material) => material.metetype === "photo",
  )?.id;
  const videoMaterialId = typeZeroMaterials.find(
    (material) => material.metetype === "video",
  )?.id;
  const nextDraftInfo = patchDraftInfo(draftInfo, {
    projectName,
    videoPath: input.videoPath,
    videoMetadata: input.videoMetadata,
    profileImagePath: input.profileImagePath,
    profileImageMetadata: input.profileImageMetadata,
    start: input.selection.start,
    end: input.selection.end,
    titleText: input.selection.titleText,
    channelNameText: input.selection.channelNameText,
    topGeneralText: input.selection.topGeneralText,
    topHighlightText: input.selection.topHighlightText,
    now,
  });
  const subtitleMaterialIds: string[] = [];
  if (input.subtitleStyle) {
    const assets = await addTranscriptSubtitles(nextDraftInfo, {
      stagingPath: projectDirectoryPath, finalPath: input.finalProjectPath,
      start: clipStart / 1000000, end: clipEnd / 1000000,
      cues: input.subtitleCues, style: input.subtitleStyle, fontPath: input.subtitleFontPath,
    });
    const photoEntry = typeZeroMaterials.find((entry) => entry.metetype === "photo");
    for (const asset of assets) {
      subtitleMaterialIds.push(asset.id);
      typeZeroMaterials.push({ ...photoEntry, id: asset.id, file_Path: asset.path,
        extra_info: basename(asset.path), metetype: "photo", type: 0,
        width: nextDraftInfo.canvas_config.width, height: nextDraftInfo.canvas_config.height,
        duration: clipDuration, create_time: Math.floor(now.getTime() / 1000),
        import_time: Math.floor(now.getTime() / 1000), import_time_ms: now.getTime() * 1000,
      });
    }
    if (typeof nextDraftMetaInfo.draft_timeline_materials_size_ === "number") {
      nextDraftMetaInfo.draft_timeline_materials_size_ += assets.reduce((total, asset) => total + asset.size, 0);
    }
  }
  const nextDraftAgencyConfig = patchDraftAgencyConfig(draftAgencyConfig, {
    profileImagePath: input.profileImagePath,
  });
  const nextDraftVirtualStore = patchDraftVirtualStore(draftVirtualStore, {
    mediaMaterialIds: [
      placeholderMaterialId,
      photoMaterialId,
      videoMaterialId,
      ...subtitleMaterialIds,
    ].flatMap((materialId) =>
      typeof materialId === "string" && materialId.length > 0 ? [materialId] : [],
    ),
  });

  const writes: Promise<unknown>[] = [
    writeFile(draftInfoPath, JSON.stringify(nextDraftInfo, null, 2), "utf8"),
    writeFile(
      draftMetaInfoPath,
      JSON.stringify(nextDraftMetaInfo, null, 2),
      "utf8",
    ),
    writeFile(
      draftAgencyConfigPath,
      JSON.stringify(nextDraftAgencyConfig, null, 2),
      "utf8",
    ),
    writeFile(
      draftVirtualStorePath,
      JSON.stringify(nextDraftVirtualStore, null, 2),
      "utf8",
    ),
  ];

  try {
    await ensureReadableFilePath(draftInfoBackupPath, "cloned draft_info.json.bak");
    writes.push(
      writeFile(draftInfoBackupPath, JSON.stringify(nextDraftInfo, null, 2), "utf8"),
    );
  } catch {
    // Some drafts may not carry the backup file. Skip it when absent.
  }

  try {
    const rawTemplateTmp = await readJsonFile<unknown>(
      templateTmpPath,
      "cloned template-2.tmp",
    );
    const nextTemplateTmp = patchTemplateTmpMediaFields(rawTemplateTmp, {
      projectName,
      clipDuration,
      now,
      videoPath: input.videoPath,
      profileImagePath: input.profileImagePath,
      videoMetadata: input.videoMetadata,
      profileImageMetadata: input.profileImageMetadata,
    });
    writes.push(
      writeFile(templateTmpPath, JSON.stringify(nextTemplateTmp, null, 2), "utf8"),
    );
  } catch {
    // Some drafts may not carry template-2.tmp. Skip it when absent.
  }

  await Promise.all(writes);

  await rewriteNestedProjectMediaReferences(projectDirectoryPath, input.templateProjectPath, {
    videoPath: input.videoPath,
    videoMetadata: input.videoMetadata,
    videoLocalMaterialId:
      typeof nestedVideoLocalMaterialId === "string" &&
      nestedVideoLocalMaterialId.length > 0
        ? nestedVideoLocalMaterialId
        : undefined,
    profileImagePath: input.profileImagePath,
    profileImageMetadata: input.profileImageMetadata,
  });

  const projectDataFiles = await listProjectDataFiles(projectDirectoryPath);
  const fontPath = getTemplateFontPath();
  await Promise.all(projectDataFiles.map(async (filePath) => {
    const raw = await readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const patched = patchTemplateFontPaths(parsed, fontPath);
    if (JSON.stringify(parsed) !== JSON.stringify(patched)) {
      await writeFile(filePath, JSON.stringify(patched, null, 2), "utf8");
    }
  }));

  await assertNoStaleTemplateMediaPaths(projectDirectoryPath, input.templateProjectPath, {
    videoPath: input.videoPath,
    profileImagePath: input.profileImagePath,
  });
}

function patchTemplateTmpMediaFields(
  rawTemplateTmp: unknown,
  input: {
    projectName: string;
    clipDuration: number;
    now: Date;
    videoPath: string;
    profileImagePath: string;
    videoMetadata: MediaFileMetadata;
    profileImageMetadata: MediaFileMetadata;
  },
): unknown {
  if (!rawTemplateTmp || typeof rawTemplateTmp !== "object") {
    return rawTemplateTmp;
  }

  if (
    !("materials" in rawTemplateTmp) ||
    !rawTemplateTmp.materials ||
    typeof rawTemplateTmp.materials !== "object" ||
    !("videos" in rawTemplateTmp.materials) ||
    !Array.isArray(rawTemplateTmp.materials.videos)
  ) {
    return rawTemplateTmp;
  }

  const nextTemplateTmp = structuredClone(rawTemplateTmp) as Record<string, unknown>;
  const videos = (nextTemplateTmp.materials as { videos: Array<Record<string, unknown>> })
    .videos;
  const nowUnix = Math.floor(input.now.getTime() / 1000);

  if (typeof nextTemplateTmp.name === "string") {
    nextTemplateTmp.name = input.projectName;
  }

  if (typeof nextTemplateTmp.duration === "number") {
    nextTemplateTmp.duration = input.clipDuration;
  }

  if (typeof nextTemplateTmp.create_time === "number") {
    nextTemplateTmp.create_time = nowUnix;
  }

  if (typeof nextTemplateTmp.update_time === "number") {
    nextTemplateTmp.update_time = nowUnix;
  }

  for (const material of videos) {
    if (material.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6") {
      material.path = input.videoPath;
      material.material_name = "";
      material.local_material_id = "";
      material.category_name = "";
      material.is_copyright = true;
      material.duration = input.videoMetadata.durationUnits ?? material.duration;
      material.width = input.videoMetadata.width;
      material.height = input.videoMetadata.height;
      material.has_audio = input.videoMetadata.hasAudio;
    }

    if (material.id === "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622") {
      material.path = input.profileImagePath;
      material.material_name = basename(input.profileImagePath);
      material.local_material_id = "";
      material.category_name = "local";
      material.is_copyright = false;
      material.width = input.profileImageMetadata.width;
      material.height = input.profileImageMetadata.height;
      material.has_audio = false;
    }
  }

  return nextTemplateTmp;
}

async function rewriteNestedProjectMediaReferences(
  outputProjectPath: string,
  templateProjectPath: string,
  input: {
    videoPath: string;
    videoMetadata: MediaFileMetadata;
    videoLocalMaterialId?: string;
    profileImagePath: string;
    profileImageMetadata: MediaFileMetadata;
  },
): Promise<void> {
  const [templateProjectDataFiles, projectDataFiles] = await Promise.all([
    listProjectDataFiles(templateProjectPath),
    listProjectDataFiles(outputProjectPath),
  ]);

  const templateMediaPaths = new Set<string>();
  for (const filePath of templateProjectDataFiles) {
    const raw = await readFile(filePath, "utf8");

    try {
      collectAbsoluteMediaPaths(JSON.parse(raw), templateMediaPaths);
    } catch {
      continue;
    }
  }

  const templateVideoPathCandidates = Array.from(templateMediaPaths).filter((entry) =>
    /\.(mp4|mov|m4v|mkv)$/i.test(entry),
  );
  const templateProfilePathCandidates = Array.from(templateMediaPaths).filter((entry) =>
    /\.(png|jpe?g|webp|gif)$/i.test(entry),
  );

  const pathReplacements = new Map<string, string>();
  const basenameReplacements = new Map<string, string>();

  for (const templateVideoPath of templateVideoPathCandidates) {
    pathReplacements.set(templateVideoPath, input.videoPath);
    basenameReplacements.set(basename(templateVideoPath), basename(input.videoPath));
  }

  for (const templateProfilePath of templateProfilePathCandidates) {
    pathReplacements.set(templateProfilePath, input.profileImagePath);
    basenameReplacements.set(
      basename(templateProfilePath),
      basename(input.profileImagePath),
    );
  }

  const nestedProjectDataFiles = projectDataFiles.filter((filePath) =>
    relative(outputProjectPath, filePath).split(/[\\/]/).includes("subdraft"),
  );

  await Promise.all(
    nestedProjectDataFiles.map(async (filePath) => {
      const raw = await readFile(filePath, "utf8");

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const nextParsed = replaceProjectMediaReferences(parsed, {
        pathReplacements,
        basenameReplacements,
        uuidReplacements: new Map(),
        videoPath: input.videoPath,
        videoMetadata: input.videoMetadata,
        videoLocalMaterialId: input.videoLocalMaterialId,
        profileImagePath: input.profileImagePath,
        profileImageMetadata: input.profileImageMetadata,
      });

      if (JSON.stringify(parsed) !== JSON.stringify(nextParsed)) {
        await writeFile(filePath, JSON.stringify(nextParsed, null, 2), "utf8");
      }
    }),
  );
}

async function assertNoStaleTemplateMediaPaths(
  outputProjectPath: string,
  templateProjectPath: string,
  input: {
    videoPath: string;
    profileImagePath: string;
  },
): Promise<void> {
  const [templateDraftInfo, templateDraftMetaInfo, generatedDraftInfo, generatedDraftMetaInfo] =
    await Promise.all([
      readJsonFile<CapCutDraftInfo>(
        join(templateProjectPath, "draft_info.json"),
        "template draft_info.json",
      ),
      readJsonFile<CapCutDraftMetaInfo>(
        join(templateProjectPath, "draft_meta_info.json"),
        "template draft_meta_info.json",
      ),
      readJsonFile<CapCutDraftInfo>(
        join(outputProjectPath, "draft_info.json"),
        "generated draft_info.json",
      ),
      readJsonFile<CapCutDraftMetaInfo>(
        join(outputProjectPath, "draft_meta_info.json"),
        "generated draft_meta_info.json",
      ),
    ]);

  const stalePaths = new Set<string>();
  const templateMainVideoPath = templateDraftInfo.materials.videos.find(
    (item) => item.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
  )?.path;
  const templateProfileImagePath = templateDraftInfo.materials.videos.find(
    (item) => item.id === "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622",
  )?.path;

  const templateMetaMaterials =
    templateDraftMetaInfo.draft_materials?.find((entry) => entry.type === 0)?.value ?? [];

  const templateMetaVideoPath = templateMetaMaterials.find(
    (item) => item.metetype === "video",
  )?.file_Path;
  const templateMetaPhotoPath = templateMetaMaterials.find(
    (item) => item.metetype === "photo",
  )?.file_Path;

  for (const path of [
    templateMainVideoPath,
    templateProfileImagePath,
    templateMetaVideoPath,
    templateMetaPhotoPath,
  ]) {
    if (
      path &&
      path !== input.videoPath &&
      path !== input.profileImagePath
    ) {
      stalePaths.add(path);
    }
  }

  const generatedRawFiles = await Promise.all([
    readFile(join(outputProjectPath, "draft_info.json"), "utf8"),
    readFile(join(outputProjectPath, "draft_meta_info.json"), "utf8"),
    readFile(join(outputProjectPath, "draft_agency_config.json"), "utf8"),
  ]);

  for (const stalePath of stalePaths) {
    if (generatedRawFiles.some((content) => content.includes(stalePath))) {
      throw new Error(`Generated draft still contains template media path: ${stalePath}`);
    }
  }

  const generatedVideoPath = generatedDraftInfo.materials.videos.find(
    (item) => item.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
  )?.path;
  const generatedProfileImagePath = generatedDraftInfo.materials.videos.find(
    (item) => item.id === "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622",
  )?.path;

  if (generatedVideoPath !== input.videoPath) {
    throw new Error("Generated draft_info.json does not contain the expected video path");
  }

  if (generatedProfileImagePath !== input.profileImagePath) {
    throw new Error(
      "Generated draft_info.json does not contain the expected profile image path",
    );
  }

  const generatedMetaMaterials =
    generatedDraftMetaInfo.draft_materials?.find((entry) => entry.type === 0)?.value ?? [];

  const generatedMetaVideoPath = generatedMetaMaterials.find(
    (item) => item.metetype === "video",
  )?.file_Path;
  const generatedMetaPhotoPath = generatedMetaMaterials.find(
    (item) => item.metetype === "photo",
  )?.file_Path;
  const generatedMetaPlaceholderPath = generatedMetaMaterials.find(
    (item) => item.metetype === "none",
  )?.file_Path;

  if (generatedMetaVideoPath !== input.videoPath) {
    throw new Error(
      "Generated draft_meta_info.json does not contain the expected video path",
    );
  }

  if (generatedMetaPhotoPath !== input.profileImagePath) {
    throw new Error(
      "Generated draft_meta_info.json does not contain the expected profile image path",
    );
  }

  if (generatedMetaPlaceholderPath !== "") {
    throw new Error(
      "Generated draft_meta_info.json does not contain the expected placeholder entry",
    );
  }
}

async function generateProject(
  input: ValidatedGenerationRequest,
  selection: ReviewedSelection,
  index: number,
): Promise<GeneratedProject> {
  const baseProjectName = buildProjectName(input.originalTitle, index, selection);
  let cloned = false;
  let outputProjectPath = "";
  let stagingProjectPath = "";
  let stagingRootPath = "";
  let projectName = "";

  try {
    const cloneResult = await cloneProjectWithDeterministicSuffix(
      input.templateProjectPath,
      input.capCutProjectsRootPath,
      baseProjectName,
    );
    outputProjectPath = cloneResult.outputProjectPath;
    stagingProjectPath = cloneResult.stagingProjectPath;
    stagingRootPath = cloneResult.stagingRootPath;
    projectName = cloneResult.projectName;
    cloned = true;
    const projectProfileImage = await copyProjectMediaAsset({
      sourcePath: input.profileImagePath,
      stagingProjectPath,
      finalProjectPath: outputProjectPath,
      kind: "profile",
    });

    await patchProjectDraft(stagingProjectPath, projectName, {
      finalProjectPath: outputProjectPath,
      videoPath: input.videoPath,
      stagingVideoPath: input.videoPath,
      profileImagePath: projectProfileImage.finalPath,
      stagingProfileImagePath: projectProfileImage.stagingPath,
      videoMetadata: input.videoMetadata,
      profileImageMetadata: input.profileImageMetadata,
      selection,
      templateProjectPath: input.templateProjectPath,
      subtitleStyle: input.subtitleStyle,
      subtitleCues: input.subtitleCues,
      subtitleFontPath: input.subtitleFontPath,
    });
    await rename(stagingProjectPath, outputProjectPath);
    await rm(stagingRootPath, { recursive: true, force: true });
  } catch (error) {
    if (cloned) {
      await rm(outputProjectPath, { recursive: true, force: true });
      await rm(stagingRootPath, { recursive: true, force: true });
    }

    throw error;
  }

  return {
    selectionId: selection.id,
    projectPath: outputProjectPath,
  };
}

async function generateProjects(
  input: ValidatedGenerationRequest,
): Promise<Pick<ProjectGenerationResult, "projects" | "failures">> {
  const projects: GeneratedProject[] = [];
  const failures: ProjectGenerationFailure[] = [];

  for (const [index, selection] of input.enabledSelections.entries()) {
    try {
      const project = await generateProject(input, selection, index);
      projects.push(project);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project generation failed";

      failures.push({
        selectionId: selection.id,
        reason: message,
      });
    }
  }

  return { projects, failures };
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: ValidatedGenerationRequest;

  try {
    input = await parseRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid generation request";

    return jsonError(400, "INVALID_INPUT", message);
  }

  const runId = crypto.randomUUID();

  try {
    const { projects, failures } = await generateProjects(input);
    const warnings: string[] = [];
    const { enabledSelections: _enabledSelections, ...manifestRequest } = input;

    try {
      await writeRunManifest({
        runId,
        createdAt: new Date().toISOString(),
        request: manifestRequest,
        projects,
        failures,
      });
    } catch (error) {
      warnings.push(
        `Failed to write run manifest: ${
          error instanceof Error ? error.message : "Unknown manifest error"
        }`,
      );
    }

    return NextResponse.json({
      runId,
      projects,
      failures,
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies ProjectGenerationResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate projects";

    return jsonError(500, "PROJECT_GENERATION_ERROR", message);
  }
}
