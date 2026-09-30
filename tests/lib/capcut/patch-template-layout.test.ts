import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CapCutDraftInfo } from "@/lib/capcut/patch-draft-info";
import { patchTemplateLayout } from "@/lib/capcut/patch-template-layout";
import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";
import { TEMPLATE_LAYOUT, TEMPLATE_STYLE, TEMPLATE_COVER_WIDTH } from "@/lib/capcut/template-layout";
import { readSubtitleFont, subtitleFontName } from "@/lib/subtitles/render";

describe("CapCut preview layout", () => {
  it.each(["OpenAI", "아주긴채널이름도겹치지않고표시합니다"])("keeps photo and %s apart and aligns all preview positions", async (text) => {
    const draft = JSON.parse(await readFile(resolve("templates/capcut/base-template/draft_info.json"), "utf8")) as CapCutDraftInfo;
    const font = await readSubtitleFont(resolve("public/fonts/Pretendard-Black.otf"));
    expect(subtitleFontName(font)).toBe("Pretendard Black");
    const name = draft.materials.texts.find((item) => item.id === CAPCUT_SLOT_MAP.channelNameMaterialId)!;
    const content = JSON.parse(name.content); content.text = text; name.content = JSON.stringify(content);
    patchTemplateLayout(draft, font);
    const tracks = draft.tracks as unknown as Array<{ id: string; segments: Array<{
      clip: { transform: { x: number; y: number }; scale: { x: number; y: number } };
      source_timerange: { start: number; duration: number };
    }> }>;
    const segment = (id: string) => tracks.find((track) => track.id === id)!.segments[0];
    const photo = segment(CAPCUT_SLOT_MAP.profileImageTrackId);
    const channel = segment(CAPCUT_SLOT_MAP.channelNameTrackId);
    expect(photo.clip.transform.y).toBe(channel.clip.transform.y);
    expect(photo.clip.transform.y).toBe(TEMPLATE_LAYOUT.channelGroup.y);
    const lines = JSON.parse(name.content).text.split("\n");
    expect(lines.join("")).toBe(text);
    const nameWidth = Math.max(...lines.map((line: string) => font.getAdvanceWidth(line, TEMPLATE_STYLE.channelFontPx / TEMPLATE_COVER_WIDTH * 1080)));
    const photoRight = (photo.clip.transform.x + 1) / 2 * 1080 + photo.clip.scale.x * 1080 / 2;
    const nameLeft = (channel.clip.transform.x + 1) / 2 * 1080 - nameWidth / 2;
    expect(nameLeft - photoRight).toBeCloseTo(TEMPLATE_STYLE.channelGapRatio * 1080, 6);
    expect(photo.source_timerange.duration).toBe(draft.duration);
    expect(segment(CAPCUT_SLOT_MAP.titleTextTrackId).clip.transform).toEqual(TEMPLATE_LAYOUT.title);
    expect(segment(CAPCUT_SLOT_MAP.mainVideoTrackId).clip.transform).toEqual({ x: 0, y: -2 * TEMPLATE_LAYOUT.videoOffsetY });
  });
});
