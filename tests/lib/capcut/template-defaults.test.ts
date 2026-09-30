import { access } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCapCutProjectsRootPath,
  getCapCutUserDataRootPath,
  getDefaultChannelImagePath,
  getTemplateFontPath,
} from "@/lib/capcut/template-defaults";
import { buildLocalFontPreviewSrc } from "@/lib/media/preview-sources";

afterEach(() => vi.unstubAllEnvs());

describe("portable template defaults", () => {
  it("uses the current user's home and supports a configured CapCut directory", () => {
    vi.stubEnv("CAPCUT_AUTOMATION_PROJECTS_ROOT", "");
    expect(getCapCutProjectsRootPath("/home/editor")).toBe(
      "/home/editor/Movies/CapCut/User Data/Projects/com.lveditor.draft",
    );
    vi.stubEnv("CAPCUT_AUTOMATION_PROJECTS_ROOT", " /projects/custom ");
    expect(getCapCutProjectsRootPath()).toBe("/projects/custom");
    expect(getCapCutUserDataRootPath("/capcut/User Data/Projects/com.lveditor.draft"))
      .toBe("/capcut/User Data");
  });

  it("ships a default profile and font without depending on a user's installed assets", async () => {
    vi.stubEnv("CAPCUT_AUTOMATION_FONT_PATH", "");
    const fontPath = getTemplateFontPath();
    expect(fontPath).toBe(join(process.cwd(), "public", "fonts", "Pretendard-Black.otf"));
    await expect(access(fontPath)).resolves.toBeUndefined();
    await expect(access(getDefaultChannelImagePath())).resolves.toBeUndefined();
    expect(buildLocalFontPreviewSrc()).toBe("/api/local-font?template=1");
  });

  it("uses the configured export font and preserves explicit preview font requests", () => {
    vi.stubEnv("CAPCUT_AUTOMATION_FONT_PATH", " /fonts/custom.otf ");
    expect(getTemplateFontPath()).toBe("/fonts/custom.otf");
    expect(buildLocalFontPreviewSrc("/fonts/custom.otf")).toBe(
      "/api/local-font?path=%2Ffonts%2Fcustom.otf",
    );
  });
});
