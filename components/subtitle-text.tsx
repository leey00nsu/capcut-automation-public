"use client";

import type { CSSProperties } from "react";
import type { SubtitleStyle } from "@/lib/subtitles/style";
import { buildLocalFontPreviewSrc } from "@/lib/media/preview-sources";

export function SubtitleFontFace({ style }: { style: SubtitleStyle }) {
  const src = buildLocalFontPreviewSrc(style.fontSource === "local" ? style.fontPath : undefined);
  return <style>{`@font-face { font-family: "TranscriptSubtitleFont"; src: url(${JSON.stringify(src)}); font-weight: 900; font-display: swap; }`}</style>;
}

export function SubtitleText({ text, style, sample = false }: { text: string; style: SubtitleStyle; sample?: boolean }) {
  const unit = (value: number) => sample ? `${value * 0.625}px` : `${value / 1080 * 100}cqw`;
  const shadow = style.shadowEnabled
    ? `drop-shadow(${unit(style.shadowX)} ${unit(style.shadowY)} ${unit(style.shadowBlur / 2)} ${style.shadowColor}${Math.round(style.shadowOpacity * 255).toString(16).padStart(2, "0")})` : "none";
  const textStyle: CSSProperties = {
    fontFamily: '"TranscriptSubtitleFont", "Pretendard", sans-serif', fontWeight: 900,
    fontSize: unit(style.fontSize), lineHeight: 1.25,
    color: style.color, WebkitTextStroke: `${unit(style.outlineWidth)} ${style.outlineColor}`,
    paintOrder: "stroke fill",
  };
  return <span className="inline-block max-w-[90%] text-center align-middle" style={{
    padding: style.backgroundEnabled ? `${unit(style.paddingY)} ${unit(style.paddingX)}` : 0,
    borderRadius: unit(style.backgroundRadius),
    backgroundColor: style.backgroundEnabled ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, "0")}` : "transparent",
    border: style.backgroundEnabled ? `${unit(style.borderWidth)} solid ${style.borderColor}` : undefined,
  }}><span className="inline-grid break-words" style={{ filter: shadow }}>
    <span style={{ ...textStyle, gridArea: "1 / 1" }}>{text}</span>
    {style.gradient && <span aria-hidden="true" style={{ ...textStyle, gridArea: "1 / 1",
      WebkitTextStroke: "0 transparent", color: "transparent",
      backgroundImage: `linear-gradient(${style.color}, ${style.gradientEnd})`,
      backgroundClip: "text", WebkitBackgroundClip: "text",
    }}>{text}</span>}
  </span></span>;
}
