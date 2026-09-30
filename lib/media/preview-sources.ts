import {
  DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH,
} from "@/lib/capcut/template-assets";

export function buildChannelImagePreviewSrc(path: string): string {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return DEFAULT_CHANNEL_IMAGE_PUBLIC_PATH;
  }

  return `/api/local-image?path=${encodeURIComponent(normalizedPath)}`;
}

export function buildLocalVideoPreviewSrc(path: string): string {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return "";
  }

  return `/api/local-video?path=${encodeURIComponent(normalizedPath)}`;
}

export function buildLocalVideoSegmentPreviewSrc(input: {
  path: string;
  start: number;
  end: number;
}): string {
  const normalizedPath = input.path.trim();

  if (!normalizedPath) {
    return "";
  }

  return `/api/local-video/segment?path=${encodeURIComponent(normalizedPath)}&start=${input.start.toFixed(3)}&end=${input.end.toFixed(3)}`;
}

export function buildLocalFontPreviewSrc(path?: string): string {
  if (!path?.trim()) {
    return "/api/local-font?template=1";
  }
  return `/api/local-font?path=${encodeURIComponent(path)}`;
}
