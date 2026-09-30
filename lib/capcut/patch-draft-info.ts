import { basename } from "node:path";

import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";
import { timecodeToCapCutUnits } from "@/lib/capcut/time";
import type { MediaFileMetadata } from "@/lib/media/file-metadata";

type CapCutTimeRange = {
  start: number;
  duration: number;
};

type CapCutVideoMaterial = {
  id: string;
  path: string;
  material_name: string;
  [key: string]: unknown;
};

type CapCutTextContent = {
  text?: string;
  styles?: Array<{
    range?: [number, number];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type CapCutTextMaterial = {
  id: string;
  content: string;
  [key: string]: unknown;
};

type CapCutVideoSegment = {
  id: string;
  material_id: string;
  source_timerange: CapCutTimeRange;
  target_timerange: CapCutTimeRange;
  [key: string]: unknown;
};

type CapCutOverlaySegment = {
  id: string;
  material_id: string;
  target_timerange: CapCutTimeRange;
  [key: string]: unknown;
};

type CapCutTrack<TSegment> = {
  id: string;
  segments: TSegment[];
  [key: string]: unknown;
};

export type CapCutDraftInfo = {
  name: string;
  duration: number;
  canvas_config: {
    height: number;
    width: number;
    [key: string]: unknown;
  };
  materials: {
    videos: CapCutVideoMaterial[];
    texts: CapCutTextMaterial[];
    [key: string]: unknown;
  };
  tracks:
    | {
        videos: Array<CapCutTrack<CapCutVideoSegment>>;
        texts: Array<CapCutTrack<CapCutOverlaySegment>>;
        [key: string]: unknown;
      }
    | Array<
        | (CapCutTrack<CapCutVideoSegment> & { type?: "video" | string })
        | (CapCutTrack<CapCutOverlaySegment> & { type?: "text" | string })
      >;
  [key: string]: unknown;
};

export type PatchDraftInfoInput = {
  projectName: string;
  videoPath: string;
  videoMetadata: MediaFileMetadata;
  profileImagePath?: string;
  profileImageMetadata?: MediaFileMetadata;
  start: string;
  end: string;
  titleText: string;
  channelNameText: string;
  topGeneralText: string;
  topHighlightText: string;
  now?: Date;
};

function findRequiredItem<T extends { id: string }>(
  items: T[],
  id: string,
  label: string,
): T {
  const item = items.find((entry) => entry.id === id);

  if (!item) {
    throw new Error(`Missing ${label}: ${id}`);
  }

  return item;
}

function getFirstSegment<TSegment>(
  track: CapCutTrack<TSegment>,
  label: string,
): TSegment {
  const [segment] = track.segments;

  if (!segment) {
    throw new Error(`Missing segment for ${label}: ${track.id}`);
  }

  return segment;
}

function getVideoTracks(
  draftInfo: CapCutDraftInfo,
): Array<CapCutTrack<CapCutVideoSegment>> {
  if (Array.isArray(draftInfo.tracks)) {
    return draftInfo.tracks.filter(
      (track): track is CapCutTrack<CapCutVideoSegment> & { type?: string } =>
        track.type === "video",
    );
  }

  return draftInfo.tracks.videos;
}

function getTextTracks(
  draftInfo: CapCutDraftInfo,
): Array<CapCutTrack<CapCutOverlaySegment>> {
  if (Array.isArray(draftInfo.tracks)) {
    return draftInfo.tracks.filter(
      (track): track is CapCutTrack<CapCutOverlaySegment> & { type?: string } =>
        track.type === "text",
    );
  }

  return draftInfo.tracks.texts;
}

function parseTextContent(material: CapCutTextMaterial): CapCutTextContent {
  return JSON.parse(material.content) as CapCutTextContent;
}

function replaceTextMaterial(material: CapCutTextMaterial, text: string): void {
  const content = parseTextContent(material);
  const normalizedText = text.normalize("NFC");
  content.text = normalizedText;

  if (content.styles?.[0]) {
    content.styles[0].range = [0, normalizedText.length];
  }

  material.content = JSON.stringify(content);
}

function getClipWindow(start: string, end: string): {
  clipStart: number;
  clipDuration: number;
} {
  const clipStart = timecodeToCapCutUnits(start);
  const clipEnd = timecodeToCapCutUnits(end);
  const clipDuration = clipEnd - clipStart;

  if (clipDuration <= 0) {
    throw new Error(`Invalid clip range: ${start} - ${end}`);
  }

  return {
    clipStart,
    clipDuration,
  };
}

function patchProjectMetadata(
  draftInfo: CapCutDraftInfo,
  projectName: string,
  clipDuration: number,
  now: Date,
): void {
  draftInfo.name = projectName;
  draftInfo.duration = clipDuration;
  draftInfo.create_time = Math.floor(now.getTime() / 1000);
  draftInfo.update_time = Math.floor(now.getTime() / 1000);
}

function patchMainVideoMaterial(
  draftInfo: CapCutDraftInfo,
  videoPath: string,
  videoMetadata: MediaFileMetadata,
): void {
  const material = findRequiredItem(
    draftInfo.materials.videos,
    CAPCUT_SLOT_MAP.mainVideoSegmentMaterialId,
    "main video material",
  );

  material.path = videoPath;
  material.material_name = "";
  material.local_material_id = "";
  material.category_name = "";
  material.is_copyright = true;
  material.duration = videoMetadata.durationUnits ?? material.duration;
  material.width = videoMetadata.width;
  material.height = videoMetadata.height;
  material.has_audio = videoMetadata.hasAudio;
}

function patchProfileImageMaterial(
  draftInfo: CapCutDraftInfo,
  profileImagePath: string | undefined,
  profileImageMetadata: MediaFileMetadata | undefined,
): void {
  const material = findRequiredItem(
    draftInfo.materials.videos,
    CAPCUT_SLOT_MAP.profileImageMaterialId,
    "profile image material",
  );

  if (profileImagePath?.trim()) {
    material.path = profileImagePath;
    material.material_name = basename(profileImagePath);
  }

  material.local_material_id = "";
  material.category_name = "local";
  material.is_copyright = false;
  if (profileImageMetadata) {
    material.width = profileImageMetadata.width;
    material.height = profileImageMetadata.height;
  }
  material.has_audio = false;
}

function patchMainVideoSegment(
  draftInfo: CapCutDraftInfo,
  clipStart: number,
  clipDuration: number,
): void {
  const track = findRequiredItem(
    getVideoTracks(draftInfo),
    CAPCUT_SLOT_MAP.mainVideoTrackId,
    "main video track",
  );
  const segment = getFirstSegment(track, "main video track");

  segment.source_timerange.start = clipStart;
  segment.source_timerange.duration = clipDuration;
  segment.target_timerange.start = 0;
  segment.target_timerange.duration = clipDuration;
}

function patchOverlayTrackDuration(
  tracks: Array<CapCutTrack<CapCutOverlaySegment>>,
  trackId: string,
  clipDuration: number,
  label: string,
): void {
  const track = findRequiredItem(tracks, trackId, label);
  const segment = getFirstSegment(track, label);

  segment.target_timerange.start = 0;
  segment.target_timerange.duration = clipDuration;
}

function patchOverlayVideoTrackDuration(
  tracks: Array<CapCutTrack<CapCutVideoSegment>>,
  trackId: string,
  clipDuration: number,
  label: string,
): void {
  const track = findRequiredItem(tracks, trackId, label);
  const segment = getFirstSegment(track, label);

  segment.target_timerange.start = 0;
  segment.target_timerange.duration = clipDuration;
}

function patchOverlayTrackDurations(
  draftInfo: CapCutDraftInfo,
  clipDuration: number,
): void {
  patchOverlayTrackDuration(
    getTextTracks(draftInfo),
    CAPCUT_SLOT_MAP.titleTextTrackId,
    clipDuration,
    "title text track",
  );
  patchOverlayTrackDuration(
    getTextTracks(draftInfo),
    CAPCUT_SLOT_MAP.channelNameTrackId,
    clipDuration,
    "channel name track",
  );
  patchOverlayVideoTrackDuration(
    getVideoTracks(draftInfo),
    CAPCUT_SLOT_MAP.profileImageTrackId,
    clipDuration,
    "profile image track",
  );
  patchOverlayTrackDuration(
    getTextTracks(draftInfo),
    CAPCUT_SLOT_MAP.bodyTextTrackId,
    clipDuration,
    "body text track",
  );
  patchOverlayTrackDuration(
    getTextTracks(draftInfo),
    CAPCUT_SLOT_MAP.highlightTextTrackId,
    clipDuration,
    "highlight text track",
  );
}

function patchTextMaterials(
  draftInfo: CapCutDraftInfo,
  input: Pick<
    PatchDraftInfoInput,
    "titleText" | "channelNameText" | "topGeneralText" | "topHighlightText"
  >,
): void {
  replaceTextMaterial(
    findRequiredItem(
      draftInfo.materials.texts,
      CAPCUT_SLOT_MAP.titleTextMaterialId,
      "title text material",
    ),
    input.titleText,
  );
  replaceTextMaterial(
    findRequiredItem(
      draftInfo.materials.texts,
      CAPCUT_SLOT_MAP.channelNameMaterialId,
      "channel name material",
    ),
    input.channelNameText,
  );
  replaceTextMaterial(
    findRequiredItem(
      draftInfo.materials.texts,
      CAPCUT_SLOT_MAP.bodyTextMaterialId,
      "body text material",
    ),
    input.topGeneralText,
  );
  replaceTextMaterial(
    findRequiredItem(
      draftInfo.materials.texts,
      CAPCUT_SLOT_MAP.highlightTextMaterialId,
      "highlight text material",
    ),
    input.topHighlightText,
  );
}

export function patchDraftInfo(
  draftInfo: CapCutDraftInfo,
  input: PatchDraftInfoInput,
): CapCutDraftInfo {
  const nextDraftInfo = structuredClone(draftInfo);
  const { clipStart, clipDuration } = getClipWindow(input.start, input.end);
  const now = input.now ?? new Date();

  patchProjectMetadata(nextDraftInfo, input.projectName, clipDuration, now);
  patchMainVideoMaterial(
    nextDraftInfo,
    input.videoPath,
    input.videoMetadata,
  );
  patchProfileImageMaterial(
    nextDraftInfo,
    input.profileImagePath,
    input.profileImageMetadata,
  );
  patchMainVideoSegment(nextDraftInfo, clipStart, clipDuration);
  patchOverlayTrackDurations(nextDraftInfo, clipDuration);
  patchTextMaterials(nextDraftInfo, input);

  return nextDraftInfo;
}
