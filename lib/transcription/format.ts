import type { TranscriptSegment } from "@/types/session";

function padTime(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function secondsToTimecode(totalSeconds: number): string {
  const roundedMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const milliseconds = roundedMilliseconds % 1000;
  const totalWholeSeconds = Math.floor(roundedMilliseconds / 1000);
  const seconds = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${padTime(hours, 2)}:${padTime(minutes, 2)}:${padTime(seconds, 2)}.${padTime(milliseconds, 3)}`;
}

export function buildTimestampedTranscriptText(
  segments: TranscriptSegment[],
): string {
  return segments
    .map((segment) => `[${segment.start} - ${segment.end}] ${segment.text}`.trim())
    .join("\n");
}
