import type {
  VrewHighlightAnalysis,
  VrewHighlightCandidate,
  VrewSubtitle,
  VrewSubtitleGap,
} from "@/types/premiere";

export type AnalyzeVrewPremiereXmlOptions = {
  highlightDurationSeconds: number;
  minGapSeconds?: number;
};

const DEFAULT_MIN_GAP_SECONDS = 0.6;

function stripInvalidXmlControlCharacters(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textBetween(block: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`).exec(block);

  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function numberBetween(block: string, tagName: string): number | null {
  const raw = textBetween(block, tagName);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirst(block: string, pattern: RegExp): string | null {
  const match = pattern.exec(block);

  return match?.[1]?.trim() ?? null;
}

function extractGeneratorItems(xml: string): string[] {
  const matches = xml.matchAll(/<generatoritem\b[\s\S]*?<\/generatoritem>/g);

  return Array.from(matches, (match) => match[0]);
}

function extractItemId(block: string, fallbackIndex: number): string {
  const itemId = extractFirst(block, /<generatoritem\b[^>]*\bid="([^"]+)"/);

  return itemId?.length ? itemId : `generator-${String(fallbackIndex).padStart(3, "0")}`;
}

function extractText(block: string): string {
  const parameterMatch = /<parameter>\s*<parameterid>str<\/parameterid>[\s\S]*?<value>([\s\S]*?)<\/value>\s*<\/parameter>/.exec(block);
  const text = parameterMatch?.[1] ?? textBetween(block, "name") ?? "";

  return stripInvalidXmlControlCharacters(decodeXmlEntities(text)).trim();
}

export function framesToTimecode(frame: number, frameRate: number): string {
  const totalMilliseconds = Math.round((frame / frameRate) * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`,
  ].join(":");
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseSubtitles(xml: string, frameRate: number): VrewSubtitle[] {
  return extractGeneratorItems(xml)
    .map((block, index) => {
      const startFrame = numberBetween(block, "start");
      const endFrame = numberBetween(block, "end");
      const text = extractText(block);

      if (
        startFrame === null ||
        endFrame === null ||
        endFrame <= startFrame ||
        text.length === 0
      ) {
        return null;
      }

      return {
        id: `subtitle-${String(index + 1).padStart(3, "0")}`,
        sourceId: extractItemId(block, index + 1),
        text,
        start: framesToTimecode(startFrame, frameRate),
        end: framesToTimecode(endFrame, frameRate),
        startFrame,
        endFrame,
      };
    })
    .filter((subtitle): subtitle is VrewSubtitle & { sourceId: string } => subtitle !== null)
    .sort((left, right) => left.startFrame - right.startFrame)
    .map(({ sourceId: _sourceId, ...subtitle }, index) => ({
      ...subtitle,
      id: `subtitle-${String(index + 1).padStart(3, "0")}`,
    }));
}

function buildSubtitleGaps(input: {
  subtitles: VrewSubtitle[];
  frameRate: number;
  minGapSeconds: number;
}): VrewSubtitleGap[] {
  const gaps: VrewSubtitleGap[] = [];

  for (let index = 0; index < input.subtitles.length - 1; index += 1) {
    const previousSubtitle = input.subtitles[index];
    const nextSubtitle = input.subtitles[index + 1];
    const gapFrames = nextSubtitle.startFrame - previousSubtitle.endFrame;
    const durationSeconds = gapFrames / input.frameRate;

    if (durationSeconds < input.minGapSeconds) {
      continue;
    }

    gaps.push({
      id: `gap-${String(gaps.length + 1).padStart(3, "0")}`,
      start: framesToTimecode(previousSubtitle.endFrame, input.frameRate),
      end: framesToTimecode(nextSubtitle.startFrame, input.frameRate),
      startFrame: previousSubtitle.endFrame,
      endFrame: nextSubtitle.startFrame,
      durationSeconds: roundSeconds(durationSeconds),
      previousSubtitle: previousSubtitle.text,
      nextSubtitle: nextSubtitle.text,
    });
  }

  return gaps;
}

export function buildHighlightCandidates(
  gaps: VrewSubtitleGap[],
  input: {
    frameRate: number;
    sequenceDurationFrames: number;
    highlightDurationSeconds: number;
    subtitles: VrewSubtitle[];
  },
): VrewHighlightCandidate[] {
  const highlightDurationFrames = Math.round(
    input.highlightDurationSeconds * input.frameRate,
  );
  const leadFrames = Math.round(highlightDurationFrames * 0.8);

  return gaps.map((gap, index) => {
    const anchorFrame = (gap.startFrame + gap.endFrame) / 2;
    let startFrame = Math.max(0, Math.round(anchorFrame - leadFrames));
    let endFrame = startFrame + highlightDurationFrames;

    if (endFrame > input.sequenceDurationFrames) {
      endFrame = input.sequenceDurationFrames;
      startFrame = Math.max(0, endFrame - highlightDurationFrames);
    }

    return {
      id: `highlight-${String(index + 1).padStart(3, "0")}`,
      start: framesToTimecode(startFrame, input.frameRate),
      end: framesToTimecode(endFrame, input.frameRate),
      anchor: framesToTimecode(anchorFrame, input.frameRate),
      durationSeconds: roundSeconds((endFrame - startFrame) / input.frameRate),
      gapDurationSeconds: gap.durationSeconds,
      previousSubtitle: gap.previousSubtitle,
      nextSubtitle: gap.nextSubtitle,
      reason: `자막 공백 ${gap.durationSeconds.toFixed(1)}초 구간을 웃음/리액션 후보로 감지했습니다.`,
    };
  });
}

function extractSourceVideoPath(xml: string): string {
  const match = /<clipitem>[\s\S]*?<file\b[\s\S]*?<pathurl>([\s\S]*?)<\/pathurl>[\s\S]*?<\/clipitem>/.exec(xml);
  const path = match ? decodeXmlEntities(match[1].trim()) : "";

  if (!path) {
    throw new Error("Vrew XML에서 원본 영상 경로를 찾을 수 없습니다.");
  }

  return path;
}

export function analyzeVrewPremiereXml(
  rawXml: string,
  options: AnalyzeVrewPremiereXmlOptions,
): VrewHighlightAnalysis {
  if (!Number.isFinite(options.highlightDurationSeconds) || options.highlightDurationSeconds <= 0) {
    throw new Error("하이라이트 길이는 0보다 커야 합니다.");
  }

  const xml = stripInvalidXmlControlCharacters(rawXml);
  const frameRate = numberBetween(xml, "timebase") ?? 60;
  const durationFrames = numberBetween(xml, "duration") ?? 0;
  const sequenceName = textBetween(xml, "name") ?? "Vrew XML";
  const sourceVideoPath = extractSourceVideoPath(xml);
  const subtitles = parseSubtitles(xml, frameRate);
  const gaps = buildSubtitleGaps({
    subtitles,
    frameRate,
    minGapSeconds: options.minGapSeconds ?? DEFAULT_MIN_GAP_SECONDS,
  });
  const candidates = buildHighlightCandidates(gaps, {
    frameRate,
    sequenceDurationFrames: durationFrames,
    highlightDurationSeconds: options.highlightDurationSeconds,
    subtitles,
  });

  return {
    sourceVideoPath,
    sequenceName,
    frameRate,
    duration: framesToTimecode(durationFrames, frameRate),
    durationFrames,
    subtitles,
    gaps,
    candidates,
  };
}
