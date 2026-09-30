export type VrewSubtitle = {
  id: string;
  text: string;
  start: string;
  end: string;
  startFrame: number;
  endFrame: number;
};

export type VrewSubtitleGap = {
  id: string;
  start: string;
  end: string;
  startFrame: number;
  endFrame: number;
  durationSeconds: number;
  previousSubtitle: string;
  nextSubtitle: string;
};

export type VrewHighlightCandidate = {
  id: string;
  start: string;
  end: string;
  anchor: string;
  durationSeconds: number;
  gapDurationSeconds: number;
  previousSubtitle: string;
  nextSubtitle: string;
  reason: string;
};

export type VrewHighlightDurationPreset = "5" | "10" | "15" | "custom";

export type VrewHighlightAnalysis = {
  sourceVideoPath: string;
  sequenceName: string;
  frameRate: number;
  duration: string;
  durationFrames: number;
  subtitles: VrewSubtitle[];
  gaps: VrewSubtitleGap[];
  candidates: VrewHighlightCandidate[];
};
