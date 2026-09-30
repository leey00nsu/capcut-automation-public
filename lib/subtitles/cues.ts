export type SubtitleCue = { start: number; end: number; text: string };

export function timecodeSeconds(value: string): number {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length === 2) parts.unshift(0);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part)) ||
      parts[0] < 0 || parts[1] < 0 || parts[1] >= 60 || parts[2] < 0 || parts[2] >= 60) {
    throw new Error(`Invalid timecode: ${value}`);
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function parseTranscriptCues(value: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const tc = "(?:\\d{2}:)?\\d{2}:\\d{2}(?:[.,]\\d{1,3})?";
  const timedLine = new RegExp(`^\\[(${tc})\\s*-\\s*(${tc})\\]\\s*(.+)$`);
  const subtitleBlock = new RegExp(`^(${tc})\\s*-->\\s*(${tc})(?:\\s+.*)?$`);
  const lines = value.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = timedLine.exec(lines[i]);
    const block = subtitleBlock.exec(lines[i]);
    if (!match && !block) continue;
    let text = match?.[3] ?? "";
    if (block) {
      const content: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].trim()) content.push(lines[++i]);
      text = content.join(" ").replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
    }
    const timing = match ?? block!;
    const start = timecodeSeconds(timing[1]);
    const end = timecodeSeconds(timing[2]);
    text = text.replace(/\s+/g, " ").trim();
    if (end <= start) throw new Error("전사 자막의 종료 시간은 시작 시간보다 늦어야 합니다.");
    if (text) cues.push({ start, end, text });
  }
  if (!cues.length) throw new Error("대사 자막에는 타임코드가 있는 TXT, SRT 또는 VTT 전사본이 필요합니다.");
  // Rolling YouTube captions overlap; replace the previous line when the next arrives.
  cues.sort((a, b) => a.start - b.start);
  return cues.flatMap((cue, index) => {
    const end = Math.min(cue.end, cues[index + 1]?.start ?? cue.end);
    if (end <= cue.start) return [];
    const chunks = cue.text.match(/.{1,42}(?:\s|$)|\S{1,42}/gu) ?? [cue.text];
    const texts = chunks.map((chunk) => chunk.trim()).filter(Boolean);
    const total = texts.reduce((count, text) => count + Array.from(text).length, 0);
    let start = cue.start;
    return texts.map((text, part) => {
      const nextEnd = part === texts.length - 1 ? end : start + (end - cue.start) * Array.from(text).length / total;
      const result = { start, end: nextEnd, text };
      start = nextEnd;
      return result;
    });
  });
}

export function clipSubtitleCues(cues: SubtitleCue[], start: number, end: number): SubtitleCue[] {
  return cues.filter((cue) => cue.start < end && cue.end > start).map((cue) => ({
    text: cue.text, start: Math.max(start, cue.start) - start, end: Math.min(end, cue.end) - start,
  })).filter((cue) => cue.end > cue.start);
}
