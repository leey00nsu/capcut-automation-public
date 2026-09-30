"use client";

import type { MouseEvent } from "react";

import type { ReviewedClip } from "@/components/clip-state";
import { ClipPreviewStage } from "@/components/clip-preview-stage";
import {
  formatUsdEstimate,
  formatUsageTokens,
} from "@/lib/ai/usage";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PlanUsage } from "@/types/planner";
import type { SubtitleCue } from "@/lib/subtitles/cues";
import type { SubtitleStyle } from "@/lib/subtitles/style";

type ClipListProps = {
  clips: ReviewedClip[];
  videoPath: string;
  channelImagePath: string;
  usage?: PlanUsage;
  subtitleCues?: SubtitleCue[];
  subtitleStyle?: SubtitleStyle;
  disabled?: boolean;
  onToggleEnabled: (clipId: string, enabled: boolean) => void;
  onSelectTopHighlight: (clipId: string, value: string) => void;
  onSelectTopGeneral: (clipId: string, value: string) => void;
};

function parseTimestampToSeconds(timestamp: string): number {
  const [hours, minutes, seconds] = timestamp.split(":");

  return (
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  );
}

function formatClipDuration(start: string, end: string): string {
  const durationSeconds = Math.max(
    0,
    parseTimestampToSeconds(end) - parseTimestampToSeconds(start),
  );

  return `${durationSeconds.toFixed(1)}초`;
}

export function ClipList({
  clips,
  videoPath,
  channelImagePath,
  usage,
  subtitleCues,
  subtitleStyle,
  disabled = false,
  onToggleEnabled,
  onSelectTopHighlight,
  onSelectTopGeneral,
}: ClipListProps) {
  function handleCardClick(
    event: MouseEvent<HTMLElement>,
    clip: ReviewedClip,
  ): void {
    if (disabled) {
      return;
    }

    const target = event.target;

    if (
      target instanceof Element &&
      target.closest("button, label, video, a, input, textarea, select")
    ) {
      return;
    }

    onToggleEnabled(clip.id, !clip.enabled);
  }

  return (
    <Card className="bg-surface/95 ring-white/6">
      <CardHeader className="flex flex-col gap-4 px-6 pt-6 md:px-8 md:pt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.1rem]">
              클립 후보
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">후보 {clips.length}개</Badge>
              <Badge variant="muted">
                생성 {clips.filter((clip) => clip.enabled).length}개
              </Badge>
            </div>
            {usage ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="muted">
                  {usage.provider === "codex" ? "Codex OAuth" : "OpenAI API"} · {usage.model}
                </Badge>
                <Badge variant="muted">{formatUsageTokens(usage.totalTokens)}</Badge>
                <Badge variant="accent">{formatUsdEstimate(usage.estimatedCostUsd)}</Badge>
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6 md:px-8 md:pb-8">
        <div
          className="grid grid-cols-3 gap-3 xl:grid-cols-4"
          role="list"
          aria-label="clip candidates"
        >
          {clips.map((clip, index) => {
            const checkboxId = `clip-enabled-${clip.id}`;
            const durationLabel = formatClipDuration(clip.start, clip.end);

            return (
              <article
                key={clip.id}
                onClick={(event) => handleCardClick(event, clip)}
                className={[
                  "group w-full cursor-pointer rounded-[1rem] bg-surface-low p-2.5 shadow-[0_12px_24px_rgba(14,14,14,0.12)] ring-1 transition-all",
                  clip.enabled
                    ? "ring-white/6 hover:bg-surface-high"
                    : "ring-white/4 opacity-72",
                  disabled ? "" : "hover:-translate-y-0.5",
                ].join(" ")}
              >
                <div className="flex flex-col gap-2">
                  <ClipPreviewStage
                    clip={clip}
                    index={index}
                    videoPath={videoPath}
                    channelImagePath={channelImagePath}
                    compact
                    subtitleCues={subtitleCues}
                    subtitleStyle={subtitleStyle}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <h3 className="font-heading text-[0.9rem] leading-tight tracking-[-0.03em] text-balance">
                        {clip.start} ~ {clip.end}
                      </h3>
                      <p className="text-[0.66rem] font-medium text-muted-foreground">
                        {durationLabel}
                      </p>
                    </div>

                    <label
                      htmlFor={checkboxId}
                      className="flex shrink-0 items-center gap-2 rounded-full bg-surface-high px-2 py-1.5 text-[0.68rem] text-muted-foreground"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={clip.enabled}
                        onCheckedChange={(checked) =>
                          onToggleEnabled(clip.id, checked === true)
                        }
                        disabled={disabled}
                      />
                      <span className="hidden xl:inline">생성</span>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <section className="space-y-1">
                      <p className="text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        하이라이트
                      </p>
                      <ToggleGroup
                        type="single"
                        value={clip.topHighlightText}
                        onValueChange={(value) => {
                          if (value) {
                            onSelectTopHighlight(clip.id, value);
                          }
                        }}
                        className="flex w-full flex-wrap gap-1"
                        disabled={disabled}
                      >
                        {clip.topHighlightCandidates.map((candidate) => (
                          <ToggleGroupItem
                            key={`${clip.id}-highlight-${candidate}`}
                            value={candidate}
                            size="sm"
                            className="h-auto rounded-full px-2 py-1 text-[0.62rem]"
                            aria-label={`Clip ${index + 1} highlight candidate ${candidate}`}
                          >
                            {candidate}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </section>

                    <section className="space-y-1">
                      <p className="text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        일반 자막
                      </p>
                      <ToggleGroup
                        type="single"
                        value={clip.topGeneralText}
                        onValueChange={(value) => {
                          if (value) {
                            onSelectTopGeneral(clip.id, value);
                          }
                        }}
                        className="flex w-full flex-wrap gap-1"
                        disabled={disabled}
                      >
                        {clip.topGeneralCandidates.map((candidate) => (
                          <ToggleGroupItem
                            key={`${clip.id}-general-${candidate}`}
                            value={candidate}
                            size="sm"
                            className="h-auto rounded-full px-2 py-1 text-[0.62rem]"
                            aria-label={`Clip ${index + 1} general candidate ${candidate}`}
                          >
                            {candidate}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </section>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
