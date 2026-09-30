import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cloneTemplateProject } from "@/lib/capcut/clone-template";
import { patchDraftInfo } from "@/lib/capcut/patch-draft-info";
import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";

const currentDir = dirname(fileURLToPath(import.meta.url));
const templateFixturePath = join(
  currentDir,
  "../../fixtures/capcut/template-draft-info.json",
);
const builtInTemplatePath = join(
  process.cwd(),
  "templates/capcut/base-template/draft_info.json",
);

const testVideoMetadata = {
  width: 1920,
  height: 1080,
  hasAudio: true,
  durationUnits: 1_002_900_000,
};

const testProfileImageMetadata = {
  width: 176,
  height: 176,
  hasAudio: false,
};

type DraftInfoFixture = {
  name: string;
  duration: number;
  canvas_config: {
    height: number;
    width: number;
  };
  materials: {
    videos: Array<{
      id: string;
      path: string;
      material_name: string;
      local_material_id?: string;
      category_name?: string;
      is_copyright?: boolean;
      duration?: number;
    }>;
    texts: Array<{
      id: string;
      content: string;
      transform?: unknown;
    }>;
  };
  tracks: {
    videos: Array<{
      id: string;
      segments: Array<{
        id: string;
        material_id: string;
        source_timerange: {
          start: number;
          duration: number;
        };
        target_timerange: {
          start: number;
          duration: number;
        };
        transform?: unknown;
      }>;
    }>;
    texts: Array<{
      id: string;
      segments: Array<{
        id: string;
        material_id: string;
        target_timerange: {
          start: number;
          duration: number;
        };
        transform?: unknown;
      }>;
    }>;
  };
};

async function loadTemplateFixture(): Promise<DraftInfoFixture> {
  const content = await readFile(templateFixturePath, "utf8");
  return JSON.parse(content) as DraftInfoFixture;
}

async function loadBuiltInTemplateDraft(): Promise<Record<string, unknown>> {
  const content = await readFile(builtInTemplatePath, "utf8");
  return JSON.parse(content) as Record<string, unknown>;
}

function getTextMaterial(
  draftInfo: DraftInfoFixture,
  materialId: string,
): DraftInfoFixture["materials"]["texts"][number] {
  const material = draftInfo.materials.texts.find((item) => item.id === materialId);

  if (!material) {
    throw new Error(`Missing text material: ${materialId}`);
  }

  return material;
}

function getTrackSegment<
  TTrack extends
    | DraftInfoFixture["tracks"]["videos"][number]
    | DraftInfoFixture["tracks"]["texts"][number],
>(tracks: TTrack[], trackId: string): TTrack["segments"][number] {
  const track = tracks.find((item) => item.id === trackId);

  if (!track) {
    throw new Error(`Missing track: ${trackId}`);
  }

  const [segment] = track.segments;

  if (!segment) {
    throw new Error(`Missing segment for track: ${trackId}`);
  }

  return segment;
}

function parseTextMaterialContent(
  material: DraftInfoFixture["materials"]["texts"][number],
): {
  text: string;
  styles?: Array<{ range?: [number, number]; stroke?: unknown }>;
} {
  return JSON.parse(material.content) as {
    text: string;
    styles?: Array<{ range?: [number, number]; stroke?: unknown }>;
  };
}

describe("cloneTemplateProject", () => {
  it("copies the template project directory recursively", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "capcut-clone-template-"));
    const templateDir = join(rootDir, "template");
    const outputDir = join(rootDir, "output");

    try {
      await mkdir(templateDir, { recursive: true });
      await cp(templateFixturePath, join(rootDir, "seed.json"));
      await cp(join(rootDir, "seed.json"), join(templateDir, "seed.json"));
      await writeFile(join(templateDir, "nested.txt"), "fixture", "utf8");

      await cloneTemplateProject(templateDir, outputDir);

      await expect(readFile(join(outputDir, "nested.txt"), "utf8")).resolves.toBe(
        "fixture",
      );
      await expect(
        readFile(join(outputDir, "seed.json"), "utf8"),
      ).resolves.toContain("\"Template Project\"");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("fails when the destination project directory already exists", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "capcut-clone-template-existing-"));
    const templateDir = join(rootDir, "template");
    const outputDir = join(rootDir, "output");

    try {
      await mkdir(templateDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(templateDir, "nested.txt"), "fixture", "utf8");

      await expect(cloneTemplateProject(templateDir, outputDir)).rejects.toThrow(
        `Destination project directory already exists: ${outputDir}`,
      );
      await expect(readFile(join(templateDir, "nested.txt"), "utf8")).resolves.toBe(
        "fixture",
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("patchDraftInfo", () => {
  it("patches the known template slots and preserves the rest", async () => {
    const templateDraftInfo = await loadTemplateFixture();

    const nextDraftInfo = patchDraftInfo(templateDraftInfo as never, {
      projectName: "short-001",
      videoPath: "/Users/test/Videos/final-source.mov",
      videoMetadata: testVideoMetadata,
      start: "00:01:09.366",
      end: "00:01:36.800",
      titleText: "새 제목 | 채널",
      channelNameText: "새 채널명",
      topGeneralText: "새 본문 문구",
      topHighlightText: "새 하이라이트",
    }) as unknown as DraftInfoFixture;

    const clipDuration = 27_434_000;
    const mainVideoMaterial = nextDraftInfo.materials.videos.find(
      (item) => item.id === CAPCUT_SLOT_MAP.mainVideoSegmentMaterialId,
    );
    const profileImageMaterial = nextDraftInfo.materials.videos.find(
      (item) => item.id === CAPCUT_SLOT_MAP.profileImageMaterialId,
    );

    expect(nextDraftInfo.name).toBe("short-001");
    expect(nextDraftInfo.duration).toBe(clipDuration);
    expect(nextDraftInfo.canvas_config).toEqual(templateDraftInfo.canvas_config);

    expect(mainVideoMaterial).toMatchObject({
      path: "/Users/test/Videos/final-source.mov",
      material_name: "",
      local_material_id: "",
      category_name: "",
      is_copyright: true,
      duration: 1_002_900_000,
      width: 1920,
      height: 1080,
      has_audio: true,
    });
    expect(profileImageMaterial).toMatchObject({
      path: templateDraftInfo.materials.videos.find(
        (item) => item.id === CAPCUT_SLOT_MAP.profileImageMaterialId,
      )?.path,
    });
    const mainVideoSegment = getTrackSegment(
      nextDraftInfo.tracks.videos,
      CAPCUT_SLOT_MAP.mainVideoTrackId,
    );

    expect(mainVideoSegment.source_timerange).toEqual({
      start: 69_366_000,
      duration: clipDuration,
    });
    expect(mainVideoSegment.target_timerange).toEqual({
      start: 0,
      duration: clipDuration,
    });
    expect(mainVideoSegment.id).toBe("SEGMENT-MAIN-VIDEO");
    expect(mainVideoSegment.transform).toEqual(
      templateDraftInfo.tracks.videos[0]?.segments[0]?.transform,
    );

    const overlayTrackIds = [
      CAPCUT_SLOT_MAP.titleTextTrackId,
      CAPCUT_SLOT_MAP.channelNameTrackId,
      CAPCUT_SLOT_MAP.profileImageTrackId,
      CAPCUT_SLOT_MAP.bodyTextTrackId,
      CAPCUT_SLOT_MAP.highlightTextTrackId,
    ];

    for (const trackId of overlayTrackIds) {
      const segment =
        trackId === CAPCUT_SLOT_MAP.profileImageTrackId
          ? getTrackSegment(nextDraftInfo.tracks.videos, trackId)
          : getTrackSegment(nextDraftInfo.tracks.texts, trackId);

      expect(segment.target_timerange).toEqual({
        start: 0,
        duration: clipDuration,
      });
    }

    const titleContent = parseTextMaterialContent(
      getTextMaterial(nextDraftInfo, CAPCUT_SLOT_MAP.titleTextMaterialId),
    );
    const channelContent = parseTextMaterialContent(
      getTextMaterial(nextDraftInfo, CAPCUT_SLOT_MAP.channelNameMaterialId),
    );
    const bodyContent = parseTextMaterialContent(
      getTextMaterial(nextDraftInfo, CAPCUT_SLOT_MAP.bodyTextMaterialId),
    );
    const highlightContent = parseTextMaterialContent(
      getTextMaterial(nextDraftInfo, CAPCUT_SLOT_MAP.highlightTextMaterialId),
    );
    const originalHighlightContent = parseTextMaterialContent(
      getTextMaterial(templateDraftInfo, CAPCUT_SLOT_MAP.highlightTextMaterialId),
    );

    expect(titleContent.text).toBe("새 제목 | 채널");
    expect(titleContent.styles?.[0]?.range).toEqual([0, "새 제목 | 채널".length]);
    expect(channelContent.text).toBe("새 채널명");
    expect(channelContent.styles?.[0]?.range).toEqual([0, "새 채널명".length]);
    expect(bodyContent.text).toBe("새 본문 문구");
    expect(bodyContent.styles?.[0]?.range).toEqual([0, "새 본문 문구".length]);
    expect(highlightContent.text).toBe("새 하이라이트");
    expect(highlightContent.styles?.[0]?.range).toEqual([
      0,
      "새 하이라이트".length,
    ]);
    expect(highlightContent.styles?.[0]?.stroke).toEqual(
      originalHighlightContent.styles?.[0]?.stroke,
    );

    const profileVideoMaterial = nextDraftInfo.materials.videos.find(
      (item) => item.id === CAPCUT_SLOT_MAP.profileImageMaterialId,
    );
    const profileVideoSegment = getTrackSegment(
      nextDraftInfo.tracks.videos,
      CAPCUT_SLOT_MAP.profileImageTrackId,
    );

    expect(profileVideoMaterial?.path).toBe("default-channel-profile.png");
    expect(profileVideoMaterial?.material_name).toBe("default-channel-profile.png");
    expect(profileVideoMaterial?.category_name).toBe("local");
    expect(profileVideoMaterial?.is_copyright).toBe(false);
    expect(profileVideoMaterial?.id).toBe(CAPCUT_SLOT_MAP.profileImageMaterialId);
    expect(profileVideoSegment.source_timerange).toEqual({
      start: 0,
      duration: 12_000_000,
    });
  });

  it("replaces the profile image material path when a custom channel image is provided", async () => {
    const templateDraftInfo = await loadTemplateFixture();

    const nextDraftInfo = patchDraftInfo(templateDraftInfo as never, {
      projectName: "short-001",
      videoPath: "/Users/test/Videos/final-source.mov",
      videoMetadata: testVideoMetadata,
      profileImagePath: "/Users/test/Images/channel-profile.png",
      profileImageMetadata: testProfileImageMetadata,
      start: "00:01:09.366",
      end: "00:01:36.800",
      titleText: "새 제목 | 채널",
      channelNameText: "새 채널명",
      topGeneralText: "새 본문 문구",
      topHighlightText: "새 하이라이트",
    }) as unknown as DraftInfoFixture;

    const profileImageMaterial = nextDraftInfo.materials.videos.find(
      (item) => item.id === CAPCUT_SLOT_MAP.profileImageMaterialId,
    );

    expect(profileImageMaterial).toMatchObject({
      path: "/Users/test/Images/channel-profile.png",
      material_name: "channel-profile.png",
      local_material_id: "",
      category_name: "local",
      is_copyright: false,
      width: 176,
      height: 176,
      has_audio: false,
    });
  });

  it("normalizes decomposed Korean text before writing CapCut text materials", async () => {
    const templateDraftInfo = await loadTemplateFixture();
    const decomposedTitle = "<새로운 하루를 만드는 습관 | 예시 채널>";
    const normalizedTitle = "<새로운 하루를 만드는 습관 | 예시 채널>";

    const nextDraftInfo = patchDraftInfo(templateDraftInfo as never, {
      projectName: "short-001",
      videoPath: "/Users/test/Videos/final-source.mov",
      videoMetadata: testVideoMetadata,
      start: "00:01:09.366",
      end: "00:01:36.800",
      titleText: decomposedTitle,
      channelNameText: "예시 채널",
      topGeneralText: "만원 지하철에서 느껴지는 것",
      topHighlightText: "지하철 물놀이",
    }) as unknown as DraftInfoFixture;

    const titleContent = parseTextMaterialContent(
      getTextMaterial(nextDraftInfo, CAPCUT_SLOT_MAP.titleTextMaterialId),
    );

    expect(titleContent.text).toBe(normalizedTitle);
    expect(titleContent.styles?.[0]?.range).toEqual([0, normalizedTitle.length]);
  });

  it("patches the real built-in CapCut template structure", async () => {
    const builtInDraftInfo = await loadBuiltInTemplateDraft();

    const nextDraftInfo = patchDraftInfo(builtInDraftInfo as never, {
      projectName: "short-actual-template",
      videoPath: "/Users/test/Videos/runtime-source.mov",
      videoMetadata: testVideoMetadata,
      start: "00:01:09.366",
      end: "00:01:36.800",
      titleText: "실사용 제목 | 채널",
      channelNameText: "실사용 채널",
      topGeneralText: "실사용 일반 자막",
      topHighlightText: "실사용 하이라이트",
    }) as Record<string, unknown>;

    const materials = nextDraftInfo.materials as {
      videos: Array<{ id: string; path: string; material_name: string }>;
      texts: Array<{ id: string; content: string }>;
    };
    const tracks = nextDraftInfo.tracks as Array<{
      id: string;
      type: string;
      segments: Array<{
        target_timerange?: { start: number; duration: number };
        source_timerange?: { start: number; duration: number };
      }>;
    }>;

    expect(nextDraftInfo.name).toBe("short-actual-template");
    expect(nextDraftInfo.duration).toBe(27_434_000);
    expect(
      materials.videos.find(
        (item) => item.id === CAPCUT_SLOT_MAP.mainVideoSegmentMaterialId,
      ),
    ).toMatchObject({
      path: "/Users/test/Videos/runtime-source.mov",
      material_name: "",
      local_material_id: "",
      category_name: "",
      is_copyright: true,
    });

    expect(
      tracks.find((track) => track.id === CAPCUT_SLOT_MAP.mainVideoTrackId)
        ?.segments[0]?.source_timerange,
    ).toEqual({
      start: 69_366_000,
      duration: 27_434_000,
    });
    expect(
      tracks.find((track) => track.id === CAPCUT_SLOT_MAP.highlightTextTrackId)
        ?.segments[0]?.target_timerange,
    ).toEqual({
      start: 0,
      duration: 27_434_000,
    });
  });
});
