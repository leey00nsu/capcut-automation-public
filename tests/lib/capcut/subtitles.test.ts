import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { addTranscriptSubtitles } from "@/lib/capcut/subtitles";
import type { CapCutDraftInfo } from "@/lib/capcut/patch-draft-info";
import { readSubtitleFont, renderSubtitlePng } from "@/lib/subtitles/render";
import { applySubtitlePreset, DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS } from "@/lib/subtitles/style";

const fontPath = resolve("public/fonts/Pretendard-Black.otf");

describe("subtitle rendering and draft export", () => {
  it("renders all eight presets with a transparent canvas and real Korean glyphs", async () => {
    const font = await readSubtitleFont(fontPath);
    const output = new Set<string>();
    for (const preset of SUBTITLE_PRESETS) {
      const png = await renderSubtitlePng("가나 다라", applySubtitlePreset(DEFAULT_SUBTITLE_STYLE, preset.id), font);
      const metadata = await sharp(png).metadata();
      expect(metadata).toMatchObject({ width: 1080, height: 1920, hasAlpha: true });
      const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      expect(data[3]).toBe(0);
      output.add(png.toString("base64"));
    }
    expect(output.size).toBe(8);
  });
  it("exports local timed overlays and SRT clipped to the selected interval", async () => {
    const root = await mkdtemp(join(tmpdir(), "subtitle-draft-"));
    try {
      const draft = JSON.parse(await readFile(resolve("templates/capcut/base-template/draft_info.json"), "utf8")) as CapCutDraftInfo;
      draft.duration = 5000000;
      const assets = await addTranscriptSubtitles(draft, { stagingPath: root, finalPath: root, start: 5, end: 10,
        cues: [{ start: 4, end: 7, text: "앞 대사" }, { start: 9, end: 12, text: "뒤 대사" }],
        style: DEFAULT_SUBTITLE_STYLE, fontPath });
      const tracks = draft.tracks as Array<{ name?: string; segments: Array<{ material_id: string; target_timerange: { start: number; duration: number } }> }>;
      const track = tracks.find((track) => track.name === "전사 대사 자막")!;
      expect(track.segments.map((segment) => segment.target_timerange)).toEqual([
        { start: 0, duration: 2000000 }, { start: 4000000, duration: 1000000 },
      ]);
      for (const segment of track.segments) {
        const material = draft.materials.videos.find((material) => material.id === segment.material_id)!;
        expect(assets).toContainEqual({ id: material.local_material_id, path: material.path, size: expect.any(Number) });
        expect(await sharp(await readFile(material.path)).metadata()).toMatchObject({ width: 1080, height: 1920 });
      }
      expect(await readFile(join(root, "subtitles.srt"), "utf8")).toContain("00:00:04,000 --> 00:00:05,000\n뒤 대사");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("keeps large subtitles inside the video region", async () => {
    const font = await readSubtitleFont(fontPath);
    const png = await renderSubtitlePng("큰 글씨도 영상 안에 표시합니다", {
      ...DEFAULT_SUBTITLE_STYLE, fontSize: 120, positionY: 90, shadowEnabled: true,
    }, font);
    const { data } = await sharp(png).extract({ left: 0, top: 1352, width: 1080, height: 568 })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data.every((value, index) => index % 4 !== 3 || value === 0)).toBe(true);
  });
  it("leaves the draft unchanged when captions are disabled", async () => {
    const draft = JSON.parse(await readFile(resolve("templates/capcut/base-template/draft_info.json"), "utf8")) as CapCutDraftInfo;
    const original = structuredClone(draft);
    expect(await addTranscriptSubtitles(draft, {
      stagingPath: "/unused", finalPath: "/unused", start: 0, end: 5,
      cues: [], style: { ...DEFAULT_SUBTITLE_STYLE, enabled: false }, fontPath: "/missing.ttf",
    })).toEqual([]);
    expect(draft).toEqual(original);
  });
});
