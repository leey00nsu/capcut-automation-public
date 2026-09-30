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
  it("records the font display name in native and JSON-encoded text fields", () => {
    const material = { font_path: "", font_name: "", font_title: "none",
      content: JSON.stringify({ styles: [{ font: { id: "", path: "" } }] }) };
    const result = patchTemplateFontPaths(material, "/project/Resources/fonts/Pretendard-Black.otf", "Pretendard Black") as typeof material;
    expect(result).toMatchObject({ font_name: "Pretendard Black", font_title: "Pretendard Black" });
    expect(JSON.parse(result.content).styles[0].font).toEqual({
      id: "", path: "/project/Resources/fonts/Pretendard-Black.otf", name: "Pretendard Black",
    });
  });
});
