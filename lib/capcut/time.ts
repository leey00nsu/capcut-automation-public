const TIMECODE_PATTERN = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

function parseTimecode(value: string): number {
  const match = TIMECODE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid timecode: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);

  if (
    hours > 23 ||
    minutes > 59 ||
    seconds > 59 ||
    milliseconds > 999
  ) {
    throw new Error(`Invalid timecode: ${value}`);
  }

  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
}

function padTimePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function timecodeToCapCutUnits(value: string): number {
  return parseTimecode(value) * 1000;
}

export function capCutUnitsToTimecode(value: number): string {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value % 1000 !== 0
  ) {
    throw new Error(`Invalid CapCut time units: ${value}`);
  }

  const totalMilliseconds = value / 1000;
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return [
    padTimePart(hours),
    padTimePart(minutes),
    padTimePart(seconds),
  ].join(":") + `.${String(milliseconds).padStart(3, "0")}`;
}
