import { describe, expect, it } from "vitest";
import { patchTemplateFontPaths } from "@/lib/capcut/template-font";

describe("CapCut font references", () => {
  it("updates nested and JSON-encoded styles while preserving media paths and styling", () => {
    const draft = {
      materials: { texts: [{
        font_path: "",
        content: JSON.stringify({
          text: "예시 문구",
          styles: [{ range: [0, 5], size: 15, font: { id: "", path: "" } }],
        }),
      }], videos: [{ path: "/videos/source.mp4" }] },
      subdraft: { materials: { texts: [{ font_path: "", content: "invalid JSON" }] } },
    };
    const result = patchTemplateFontPaths(draft, "/fonts/bundled.otf") as typeof draft;
    const style = JSON.parse(result.materials.texts[0].content).styles[0];
    expect(style).toEqual({ range: [0, 5], size: 15, font: { id: "", path: "/fonts/bundled.otf" } });
    expect(result.materials.texts[0].font_path).toBe("/fonts/bundled.otf");
    expect(result.materials.videos).toEqual(draft.materials.videos);
    expect(result.subdraft.materials.texts[0]).toEqual({
      font_path: "/fonts/bundled.otf", content: "invalid JSON",
    });
    expect(draft.materials.texts[0].font_path).toBe("");
  });
});
