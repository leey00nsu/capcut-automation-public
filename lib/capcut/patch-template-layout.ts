import type { Font } from "opentype.js";
import type { CapCutDraftInfo } from "@/lib/capcut/patch-draft-info";
import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";
import { TEMPLATE_COVER_WIDTH, TEMPLATE_LAYOUT, TEMPLATE_STYLE } from "@/lib/capcut/template-layout";
import { wrapSubtitleText } from "@/lib/subtitles/render";

/** CapCut positions separate photo/text segments; match the preview's flex group. */
export function patchTemplateLayout(draft: CapCutDraftInfo, font: Font): void {
  const width = draft.canvas_config.width;
  const name = draft.materials.texts.find((item) => item.id === CAPCUT_SLOT_MAP.channelNameMaterialId);
  if (!name) throw new Error("Missing channel name material");
  const content = JSON.parse(name.content);
  const size = TEMPLATE_STYLE.channelFontPx / TEMPLATE_COVER_WIDTH * width;
  const photoSize = TEMPLATE_STYLE.profileSizePx / TEMPLATE_COVER_WIDTH * width;
  const gap = TEMPLATE_STYLE.channelGapRatio * width;
  const maxNameWidth = TEMPLATE_LAYOUT.channelGroup.widthRatio * width - photoSize - gap;
  const lines = wrapSubtitleText(content.text, font, size, maxNameWidth);
  content.text = lines.join("\n");
  for (const style of content.styles ?? []) style.range = [0, content.text.length];
  name.content = JSON.stringify(content);
  const nameWidth = Math.max(0, ...lines.map((line) => font.getAdvanceWidth(line, size)));
  const groupCenter = (TEMPLATE_LAYOUT.channelGroup.x + 1) / 2 * width;
  const photoCenter = groupCenter - (photoSize + gap + nameWidth) / 2 + photoSize / 2;
  const nameCenter = photoCenter + photoSize / 2 + gap + nameWidth / 2;
  const positions = new Map<string, { x: number; y: number }>([
    [CAPCUT_SLOT_MAP.mainVideoTrackId, { x: 0, y: -2 * TEMPLATE_LAYOUT.videoOffsetY }],
    [CAPCUT_SLOT_MAP.titleTextTrackId, TEMPLATE_LAYOUT.title],
    [CAPCUT_SLOT_MAP.bodyTextTrackId, TEMPLATE_LAYOUT.topGeneral],
    [CAPCUT_SLOT_MAP.highlightTextTrackId, TEMPLATE_LAYOUT.topHighlight],
    [CAPCUT_SLOT_MAP.profileImageTrackId, { x: photoCenter / width * 2 - 1, y: TEMPLATE_LAYOUT.channelGroup.y }],
    [CAPCUT_SLOT_MAP.channelNameTrackId, { x: nameCenter / width * 2 - 1, y: TEMPLATE_LAYOUT.channelGroup.y }],
  ]);
  const tracks = Array.isArray(draft.tracks) ? draft.tracks : [...draft.tracks.videos, ...draft.tracks.texts];
  for (const track of tracks) {
    const position = positions.get(track.id);
    const segment = track.segments[0];
    if (!position || !segment) continue;
    const clip = segment.clip as { transform: { x: number; y: number }; scale: { x: number; y: number } } | undefined;
    if (!clip) continue;
    clip.transform = { ...position };
    if (track.id === CAPCUT_SLOT_MAP.profileImageTrackId) {
      clip.scale = { x: photoSize / width, y: photoSize / width };
      if (segment.source_timerange) segment.source_timerange = { start: 0, duration: draft.duration };
    }
  }
}
