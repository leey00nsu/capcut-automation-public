import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH } from "@/lib/capcut/template-assets";

export function getDefaultChannelImagePath(
  rootDirectory = process.cwd(),
): string {
  return join(rootDirectory, "public", DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH).normalize(
    "NFC",
  );
}

export function getTemplateFontPath(rootDirectory = process.cwd()): string {
  const configured = process.env.CAPCUT_AUTOMATION_FONT_PATH?.trim();
  return configured
    ? resolve(configured).normalize("NFC")
    : join(rootDirectory, "public", "fonts", "Pretendard-Black.otf");
}

export function getCapCutProjectsRootPath(homeDirectory = homedir()): string {
  const configured = process.env.CAPCUT_AUTOMATION_PROJECTS_ROOT?.trim();
  return configured
    ? resolve(configured).normalize("NFC")
    : join(homeDirectory, "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft");
}

export function getCapCutUserDataRootPath(
  capCutProjectsRootPath = getCapCutProjectsRootPath(),
): string {
  return dirname(dirname(capCutProjectsRootPath));
}
