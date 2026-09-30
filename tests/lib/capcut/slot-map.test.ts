import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CAPCUT_SLOT_MAP } from "@/lib/capcut/slot-map";

const currentDir = dirname(fileURLToPath(import.meta.url));
const templateDraftInfo = JSON.parse(
  readFileSync(join(currentDir, "../../fixtures/capcut/template-draft-info.json"), "utf8"),
) as {
  tracks: {
    videos: Array<{ id: string }>;
    texts: Array<{ id: string }>;
  };
  materials: {
    videos: Array<{ id: string }>;
    texts: Array<{ id: string }>;
  };
};

function expectIdInSection(section: Array<{ id: string }>, id: string) {
  expect(section.some((item) => item.id === id)).toBe(true);
}

describe("CAPCUT_SLOT_MAP", () => {
  it("matches the template track and material sections", () => {
    expectIdInSection(templateDraftInfo.tracks.videos, CAPCUT_SLOT_MAP.mainVideoTrackId);
    expectIdInSection(templateDraftInfo.materials.videos, CAPCUT_SLOT_MAP.mainVideoSegmentMaterialId);

    expectIdInSection(templateDraftInfo.tracks.texts, CAPCUT_SLOT_MAP.titleTextTrackId);
    expectIdInSection(templateDraftInfo.materials.texts, CAPCUT_SLOT_MAP.titleTextMaterialId);

    expectIdInSection(templateDraftInfo.tracks.texts, CAPCUT_SLOT_MAP.channelNameTrackId);
    expectIdInSection(templateDraftInfo.materials.texts, CAPCUT_SLOT_MAP.channelNameMaterialId);

    expectIdInSection(templateDraftInfo.tracks.videos, CAPCUT_SLOT_MAP.profileImageTrackId);
    expectIdInSection(templateDraftInfo.materials.videos, CAPCUT_SLOT_MAP.profileImageMaterialId);

    expectIdInSection(templateDraftInfo.tracks.texts, CAPCUT_SLOT_MAP.bodyTextTrackId);
    expectIdInSection(templateDraftInfo.materials.texts, CAPCUT_SLOT_MAP.bodyTextMaterialId);

    expectIdInSection(templateDraftInfo.tracks.texts, CAPCUT_SLOT_MAP.highlightTextTrackId);
    expectIdInSection(templateDraftInfo.materials.texts, CAPCUT_SLOT_MAP.highlightTextMaterialId);
  });
});
