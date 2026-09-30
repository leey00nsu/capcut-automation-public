import { readFile } from "node:fs/promises";
import { parse, type Font } from "opentype.js";
import sharp from "sharp";
import type { SubtitleStyle } from "@/lib/subtitles/style";

export async function readSubtitleFont(path: string): Promise<Font> {
  const buffer = await readFile(path);
  return parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function wrapText(text: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(text)) {
    if (line && font.getAdvanceWidth(line + character, size) > width) {
      const space = line.lastIndexOf(" ");
      if (space > line.length / 2) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1) + character;
      } else {
        lines.push(line.trim());
        line = character;
      }
    } else line += character;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/** Outline glyphs from the selected font, so rendering needs no system font install. */
export function subtitleSvg(text: string, style: SubtitleStyle, font: Font,
  canvas = { width: 1080, height: 1920 }): string {
  const size = style.fontSize * canvas.width / 1080;
  const scale = canvas.width / 1080;
  const paddingX = style.paddingX * scale;
  const paddingY = style.paddingY * scale;
  const lines = wrapText(text, font, size, canvas.width * 0.9 - paddingX * 2);
  const lineHeight = size * 1.25;
  const videoHeight = canvas.width * 9 / 16;
  const videoCenter = canvas.height * (0.5 + 0.045454545454545414);
  const videoTop = videoCenter - videoHeight / 2;
  const centerY = videoTop + videoHeight * style.positionY / 100;
  const height = lineHeight * lines.length;
  const top = centerY - height / 2;
  const width = Math.max(...lines.map((line) => font.getAdvanceWidth(line, size)));
  const fill = style.gradient ? "url(#gold)" : style.color;
  const stroke = style.outlineWidth * scale;
  const paths = lines.map((line, index) => font.getPath(line,
    (canvas.width - font.getAdvanceWidth(line, size)) / 2,
    top + size + index * lineHeight, size).toPathData(2));
  const pathElements = (color: string, shadow = false) => paths.map((path) =>
    `<path d="${path}" fill="${color}" stroke="${shadow ? style.shadowColor : style.outlineColor}" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke fill"/>`).join("");
  const box = style.backgroundEnabled
    ? `<rect x="${(canvas.width - width) / 2 - paddingX}" y="${top - paddingY}" width="${width + paddingX * 2}" height="${height + paddingY * 2}" rx="${style.backgroundRadius * scale}" fill="${style.backgroundColor}" fill-opacity="${style.backgroundOpacity}" stroke="${style.borderColor}" stroke-width="${style.borderWidth * scale}"/>`
    : "";
  const shadow = style.shadowEnabled
    ? `<g transform="translate(${style.shadowX * scale} ${style.shadowY * scale})" opacity="${style.shadowOpacity}" filter="url(#shadow)">${pathElements(style.shadowColor, true)}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
    <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="${style.color}"/><stop offset="1" stop-color="${style.gradientEnd}"/></linearGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${style.shadowBlur * scale / 2}"/></filter>
    <clipPath id="video"><rect x="0" y="${videoTop}" width="${canvas.width}" height="${videoHeight}"/></clipPath></defs>
    <g clip-path="url(#video)">${box}${shadow}${pathElements(fill)}</g></svg>`;
}

export async function renderSubtitlePng(text: string, style: SubtitleStyle, font: Font,
  canvas?: { width: number; height: number }): Promise<Buffer> {
  return sharp(Buffer.from(subtitleSvg(text, style, font, canvas))).png().toBuffer();
}
