"use client";

import { Pause, Play } from "lucide-react";
import {
  createPlayer,
} from "@videojs/react";
import { Video, videoFeatures } from "@videojs/react/video";
import { selectPlayback, selectTime } from "@videojs/core/dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import type { ReviewedClip } from "@/components/clip-state";
import { SubtitleFontFace, SubtitleText } from "@/components/subtitle-text";
import type { SubtitleCue } from "@/lib/subtitles/cues";
import type { SubtitleStyle } from "@/lib/subtitles/style";
import {
  buildChannelImagePreviewSrc,
  buildLocalFontPreviewSrc,
  buildLocalVideoPreviewSrc,
} from "@/lib/media/preview-sources";

type ClipPreviewStageProps = {
  clip: ReviewedClip;
  index: number;
  videoPath: string;
  channelImagePath: string;
  compact?: boolean;
  subtitleCues?: SubtitleCue[];
  subtitleStyle?: SubtitleStyle;
};

const TEMPLATE_LAYOUT = {
  title: { x: 0, y: -0.79 },
  channelName: { x: 0.106018185913479, y: -0.4872298624754421 },
  profileImage: { x: -0.2261496462543532, y: -0.48330058939096276 },
  topGeneral: { x: 0, y: 0.4322200392927308 },
  topHighlight: { x: 0, y: 0.5893909626719056 },
  videoOffsetY: 0.045454545454545414,
} as const;

const TEMPLATE_COVER_WIDTH = 432;
const TEMPLATE_STYLE = {
  highlightFontPx: 30,
  generalFontPx: 30,
  channelFontPx: 30,
  titleFontPx: 15.53,
  profileSizePx: 47,
  highlightStrokePx: 2.1,
} as const;

const PreviewPlayer = createPlayer({ features: videoFeatures });

function timecodeToSeconds(timecode: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(timecode);

  if (!match) {
    return 0;
  }

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

function toPercentX(value: number): string {
  return `${((value + 1) / 2) * 100}%`;
}

function toPercentY(value: number): string {
  return `${((1 - value) / 2) * 100}%`;
}

function Position({
  x,
  y,
  className,
  children,
}: {
  x: number;
  y: number;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={{
        left: toPercentX(x),
        top: toPercentY(y),
      }}
    >
      {children}
    </div>
  );
}

function formatPlayerTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function ClipRangePlayer({
  clipIndex,
  source,
  poster,
  clipStart,
  clipEnd,
  onTimeChange,
}: {
  clipIndex: number;
  source: string;
  poster: string;
  clipStart: number;
  clipEnd: number;
  onTimeChange: (time: number) => void;
}) {
  const playback = PreviewPlayer.usePlayer(selectPlayback);
  const time = PreviewPlayer.usePlayer(selectTime);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initializationKey = `${source}:${clipStart.toFixed(3)}:${clipEnd.toFixed(3)}`;
  const [initializedSource, setInitializedSource] = useState<string | null>(null);
  const clipDuration = Math.max(clipEnd - clipStart, 0);
  const currentTime = time?.currentTime ?? 0;
  const localCurrentTime = Math.min(
    Math.max(currentTime - clipStart, 0),
    clipDuration,
  );
  const isPaused = playback?.paused ?? true;

  useEffect(() => {
    const media = videoRef.current;

    if (!media || initializedSource === initializationKey) {
      return;
    }

    const syncToStart = () => {
      media.currentTime = clipStart;
      setInitializedSource(initializationKey);
    };

    if (media.readyState >= 1) {
      syncToStart();
      return;
    }

    media.addEventListener("loadedmetadata", syncToStart, { once: true });

    return () => {
      media.removeEventListener("loadedmetadata", syncToStart);
    };
  }, [clipStart, initializedSource, initializationKey]);

  useEffect(() => {
    const media = videoRef.current;

    if (!media || !playback || !time) {
      return;
    }

    if (time.currentTime < clipStart) {
      media.currentTime = clipStart;
      return;
    }

    if (time.currentTime >= clipEnd) {
      playback.pause();
      media.currentTime = clipEnd;
    }
  }, [clipEnd, clipStart, playback, time]);

  async function handleTogglePlayback() {
    if (!playback || !time) {
      return;
    }

    if (!playback.paused) {
      playback.pause();
      return;
    }

    if (time.currentTime < clipStart || time.currentTime >= clipEnd) {
      await time.seek(clipStart);
    }

    await playback.play();
  }

  async function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    if (!time) {
      return;
    }

    const nextLocalTime = Number(event.target.value);
    await time.seek(clipStart + nextLocalTime);
  }

  return (
    <PreviewPlayer.Container className="size-full">
      <>
        <Video
          ref={videoRef}
          aria-label={`Clip ${clipIndex + 1} shorts preview video`}
          src={source}
          playsInline
          preload="metadata"
          poster={poster}
          onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
          onError={() => {
            setInitializedSource(null);
          }}
          className="block size-full min-h-full min-w-full object-cover object-center"
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: `url("${poster}")`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div
          data-testid="clip-preview-controls"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/92 via-black/58 to-transparent px-[3cqw] pb-[2.4cqw] pt-[7cqw] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          <div className="pointer-events-auto flex items-center gap-[2cqw]">
            <button
              type="button"
              aria-label={`Clip ${clipIndex + 1} preview ${isPaused ? "play" : "pause"}`}
              onClick={() => {
                void handleTogglePlayback();
              }}
              className="flex h-[7cqw] w-[7cqw] min-h-7 min-w-7 items-center justify-center rounded-full bg-white/14 text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              {isPaused ? (
                <Play className="size-[3.1cqw] min-h-3.5 min-w-3.5 fill-current" />
              ) : (
                <Pause className="size-[3.1cqw] min-h-3.5 min-w-3.5 fill-current" />
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-[1.2cqw]">
              <input
                aria-label={`Clip ${clipIndex + 1} preview scrubber`}
                type="range"
                min="0"
                max={clipDuration.toFixed(3)}
                step="0.001"
                value={localCurrentTime.toFixed(3)}
                onChange={(event) => {
                  void handleSeek(event);
                }}
                className="h-1.5 w-full accent-white"
              />
              <div className="flex items-center justify-between text-[2.6cqw] font-semibold tracking-[-0.02em] text-white/92">
                <span>{`${formatPlayerTime(localCurrentTime)} / ${formatPlayerTime(clipDuration)}`}</span>
              </div>
            </div>
          </div>
        </div>
      </>
    </PreviewPlayer.Container>
  );
}

function TemplateFontFace() {
  const fontSrc = buildLocalFontPreviewSrc();

  return (
    <style>{`
      @font-face {
        font-family: "CapCutTemplateFont";
        src: url("${fontSrc}") format("opentype");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }
    `}</style>
  );
}

export function ClipPreviewStage({
  clip,
  index,
  videoPath,
  channelImagePath,
  compact = false,
  subtitleCues = [],
  subtitleStyle,
}: ClipPreviewStageProps) {
  const clipStart = useMemo(() => timecodeToSeconds(clip.start), [clip.start]);
  const clipEnd = useMemo(() => timecodeToSeconds(clip.end), [clip.end]);
  const [previewTime, setPreviewTime] = useState(clipStart);
  const activeSubtitle = subtitleCues.find((cue) => cue.start <= previewTime && cue.end > previewTime);
  useEffect(() => setPreviewTime(clipStart), [clipStart]);
  const clipDuration = useMemo(
    () => Math.max(clipEnd - clipStart, 0),
    [clipEnd, clipStart],
  );
  const previewSrc = useMemo(() => buildLocalVideoPreviewSrc(videoPath), [videoPath]);
  const posterTime = useMemo(
    () => clipStart + clipDuration / 2,
    [clipDuration, clipStart],
  );
  const posterSrc = useMemo(
    () =>
      `/api/local-video/poster?path=${encodeURIComponent(videoPath.trim())}&time=${posterTime.toFixed(3)}`,
    [posterTime, videoPath],
  );
  const imageSrc = useMemo(
    () => buildChannelImagePreviewSrc(channelImagePath),
    [channelImagePath],
  );
  const channelGroupX =
    (TEMPLATE_LAYOUT.profileImage.x + TEMPLATE_LAYOUT.channelName.x) / 2;
  const channelGroupY = -0.57;

  return (
    <div className="flex justify-center">
      <TemplateFontFace />
      {subtitleStyle ? <SubtitleFontFace style={subtitleStyle} /> : null}
      <div
        role="group"
        aria-label={`Clip ${index + 1} shorts preview`}
        className={[
          "relative aspect-[9/16] w-full overflow-hidden bg-black ring-1 ring-white/8 [container-type:inline-size]",
          compact
            ? "max-w-none rounded-[1rem] shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
            : "max-w-[380px] rounded-[1.35rem] shadow-[0_20px_40px_rgba(0,0,0,0.35)]",
        ].join(" ")}
      >
        <div
          className="absolute left-1/2 aspect-video w-full max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black"
          style={{
            top: `calc(${toPercentY(0)} + ${TEMPLATE_LAYOUT.videoOffsetY * 100}%)`,
          }}
        >
          {previewSrc ? (
            <PreviewPlayer.Provider>
              <ClipRangePlayer
                clipIndex={index}
                source={previewSrc}
                poster={posterSrc}
                clipStart={clipStart}
                clipEnd={clipEnd}
                onTimeChange={setPreviewTime}
              />
            </PreviewPlayer.Provider>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black text-sm text-muted-foreground">
              영상을 불러올 수 없습니다
            </div>
          )}
          {subtitleStyle?.enabled && activeSubtitle ? (
            <div aria-label={`Clip ${index + 1} transcript subtitle`} className="pointer-events-none absolute inset-x-0 -translate-y-1/2 text-center"
              style={{ top: `${subtitleStyle.positionY}%` }}>
              <SubtitleText text={activeSubtitle.text} style={subtitleStyle} />
            </div>
          ) : null}
        </div>

        <Position
          x={TEMPLATE_LAYOUT.topHighlight.x}
          y={TEMPLATE_LAYOUT.topHighlight.y}
          className="w-[82%]"
        >
          <div
            className="relative text-center leading-[1.02] tracking-[-0.05em]"
            style={{
              fontFamily:
                '"CapCutTemplateFont","Pretendard","Apple SD Gothic Neo",sans-serif',
              fontWeight: 900,
              fontSize: `${(TEMPLATE_STYLE.highlightFontPx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 text-black"
              style={{
                textShadow: `
                  0 calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 100}cqw) 0 #000,
                  0 calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 100}cqw) 0 #000,
                  calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 100}cqw) 0 0 #000,
                  calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 100}cqw) 0 0 #000,
                  calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) 0 #000,
                  calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) 0 #000,
                  calc(${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) 0 #000,
                  calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) calc(-${(TEMPLATE_STYLE.highlightStrokePx / TEMPLATE_COVER_WIDTH) * 70}cqw) 0 #000
                `,
              }}
            >
              {clip.topHighlightText}
            </span>
            <span className="relative text-[#00ff18]">{clip.topHighlightText}</span>
          </div>
        </Position>

        <Position
          x={TEMPLATE_LAYOUT.topGeneral.x}
          y={TEMPLATE_LAYOUT.topGeneral.y}
          className="w-[82%]"
        >
          <div
            className="text-center leading-[1.08] tracking-[-0.04em] text-white"
            style={{
              fontFamily:
                '"CapCutTemplateFont","Pretendard","Apple SD Gothic Neo",sans-serif',
              fontWeight: 900,
              fontSize: `${(TEMPLATE_STYLE.generalFontPx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
            }}
          >
            {clip.topGeneralText}
          </div>
        </Position>

        <Position
          x={channelGroupX}
          y={channelGroupY}
          className="w-[44%] max-w-[44%]"
        >
          <div className="flex items-center justify-center gap-[1.6cqw]">
            <div
              className="shrink-0 overflow-hidden rounded-full"
              style={{
                width: `${(TEMPLATE_STYLE.profileSizePx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
                height: `${(TEMPLATE_STYLE.profileSizePx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
              }}
            >
              <img
                src={imageSrc}
                alt="채널 이미지 프리뷰"
                className="h-full w-full object-cover"
              />
            </div>
            <div
              className="min-w-0 text-left leading-none tracking-[-0.04em] text-white"
              style={{
                fontFamily:
                  '"CapCutTemplateFont","Pretendard","Apple SD Gothic Neo",sans-serif',
                fontWeight: 900,
                fontSize: `${(TEMPLATE_STYLE.channelFontPx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
              }}
            >
              {clip.channelNameText}
            </div>
          </div>
        </Position>

        <Position
          x={TEMPLATE_LAYOUT.title.x}
          y={TEMPLATE_LAYOUT.title.y}
          className="w-[82%]"
        >
          <div
            className="text-center leading-[1.18] tracking-[-0.02em] text-white"
            style={{
              fontFamily:
                '"CapCutTemplateFont","Pretendard","Apple SD Gothic Neo",sans-serif',
              fontWeight: 900,
              fontSize: `${(TEMPLATE_STYLE.titleFontPx / TEMPLATE_COVER_WIDTH) * 100}cqw`,
            }}
          >
            {clip.titleText}
          </div>
        </Position>
      </div>
    </div>
  );
}
