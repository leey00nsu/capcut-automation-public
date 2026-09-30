import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { CapCutDraftInfo } from "@/lib/capcut/patch-draft-info";
import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";
import { readSubtitleFont, renderSubtitlePng } from "@/lib/subtitles/render";
import { clipSubtitleCues, type SubtitleCue } from "@/lib/subtitles/cues";
import type { SubtitleStyle } from "@/lib/subtitles/style";

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

/** Timed transparent overlays preserve every preset, including gradient and local fonts. */
export async function addTranscriptSubtitles(draft: CapCutDraftInfo, input: {
  stagingPath: string; finalPath: string; start: number; end: number;
  cues: SubtitleCue[]; style: SubtitleStyle; fontPath: string;
}): Promise<Array<{ id: string; path: string; size: number }>> {
  if (!input.style.enabled) return [];
  const cues = clipSubtitleCues(input.cues, input.start, input.end);
  if (!cues.length) throw new Error("이 영상 구간에 표시할 전사 자막이 없습니다.");
  const font = await readSubtitleFont(input.fontPath);
  const materials = draft.materials.videos;
  const photo = materials.find((material) => material.id === CAPCUT_SLOT_MAP.profileImageMaterialId);
  const tracks = Array.isArray(draft.tracks) ? draft.tracks : draft.tracks.videos;
  const profileTrack = tracks.find((track) => track.id === CAPCUT_SLOT_MAP.profileImageTrackId);
  if (!photo || !profileTrack?.segments[0]) throw new Error("Missing subtitle overlay template");
  const directory = join(input.stagingPath, "Resources", "subtitles");
  await mkdir(directory, { recursive: true });
  const segments = [];
  const rendered = new Map<string, string>();
  const sizes = new Map<string, number>();
  const assets: Array<{ id: string; path: string; size: number }> = [];
  const canvas = draft.canvas_config;
  for (const [index, cue] of cues.entries()) {
    let filename = rendered.get(cue.text);
    if (!filename) {
      filename = `${String(index + 1).padStart(4, "0")}.png`;
      const png = await renderSubtitlePng(cue.text, input.style, font, canvas);
      await writeFile(join(directory, filename), png);
      sizes.set(filename, png.length);
      rendered.set(cue.text, filename);
    }
    const materialId = randomUUID();
    const localId = randomUUID();
    const path = join(input.finalPath, "Resources", "subtitles", filename);
    assets.push({ id: localId, path, size: sizes.get(filename)! });
    const start = Math.round(cue.start * 1000000);
    const duration = Math.max(1, Math.round(cue.end * 1000000) - start);
    materials.push({ ...structuredClone(photo), id: materialId,
      type: "photo", path,
      material_name: basename(filename), local_material_id: localId, category_name: "local",
      width: canvas.width, height: canvas.height, has_audio: false, duration: draft.duration,
    });
    const segment = structuredClone(profileTrack.segments[0]);
    segments.push({ ...segment, id: randomUUID(), material_id: materialId,
      extra_material_refs: [], group_id: "", render_index: 15000,
      track_render_index: tracks.length,
      source_timerange: { start: 0, duration },
      target_timerange: { start, duration },
      clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0,
        scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
    });
  }
  tracks.push({ ...structuredClone(profileTrack), id: randomUUID(), type: "video",
    name: "전사 대사 자막", segments });
  await writeFile(join(input.stagingPath, "subtitles.srt"), cues.map((cue, index) =>
    `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n"), "utf8");
  await writeFile(join(directory, "captions.json"), JSON.stringify({ style: input.style, cues }, null, 2), "utf8");
  return assets;
}
