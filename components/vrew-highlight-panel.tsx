"use client";

import { useState } from "react";
import { Clapperboard, FileText, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildLocalVideoSegmentPreviewSrc } from "@/lib/media/preview-sources";
import type {
  VrewHighlightAnalysis,
  VrewHighlightDurationPreset,
} from "@/types/premiere";

type VrewHighlightResponse = {
  xmlPath: string;
  durationPreset: VrewHighlightDurationPreset;
  highlightDurationSeconds: number;
  analysis: VrewHighlightAnalysis;
};

type VrewHighlightPanelProps = {
  xmlPath: string;
  browsing: boolean;
  sourceVideoPath: string;
  sourceVideoBrowsing: boolean;
  onXmlPathChange: (value: string) => void;
  onBrowse: () => void;
  onSourceVideoPathChange: (value: string) => void;
  onSourceVideoBrowse: () => void;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "Vrew XML 분석에 실패했습니다.";

    throw new Error(message);
  }

  return body as T;
}

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

function buildPosterSrc(input: {
  videoPath: string;
  start: string;
  end: string;
}): string {
  const startSeconds = timecodeToSeconds(input.start);
  const endSeconds = timecodeToSeconds(input.end);
  const posterTime = startSeconds + Math.max(endSeconds - startSeconds, 0) / 2;

  return `/api/local-video/poster?path=${encodeURIComponent(input.videoPath.trim())}&time=${posterTime.toFixed(3)}`;
}

function buildHighlightSegmentSrc(input: {
  videoPath: string;
  start: string;
  end: string;
}): string {
  return buildLocalVideoSegmentPreviewSrc({
    path: input.videoPath,
    start: timecodeToSeconds(input.start),
    end: timecodeToSeconds(input.end),
  });
}

export function VrewHighlightPanel({
  xmlPath,
  browsing,
  sourceVideoPath,
  sourceVideoBrowsing,
  onXmlPathChange,
  onBrowse,
  onSourceVideoPathChange,
  onSourceVideoBrowse,
}: VrewHighlightPanelProps) {
  const [durationPreset, setDurationPreset] =
    useState<VrewHighlightDurationPreset>("10");
  const [customDurationSeconds, setCustomDurationSeconds] = useState("20");
  const [response, setResponse] = useState<VrewHighlightResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subtitleCount = response?.analysis.subtitles?.length ?? 0;
  const gapCount = response?.analysis.gaps?.length ?? 0;
  const previewVideoPath =
    sourceVideoPath.trim() || response?.analysis.sourceVideoPath.trim() || "";

  async function handleSubmit() {
    const trimmedXmlPath = xmlPath.trim();

    if (!trimmedXmlPath) {
      setError("Vrew XML 경로를 입력하세요.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const requestBody: {
        xmlPath: string;
        durationPreset: VrewHighlightDurationPreset;
        customDurationSeconds?: number;
      } = {
        xmlPath: trimmedXmlPath,
        durationPreset,
      };

      if (durationPreset === "custom") {
        requestBody.customDurationSeconds = Number(customDurationSeconds);
      }

      const apiResponse = await fetch("/api/premiere/vrew/highlights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const data = await parseJsonResponse<VrewHighlightResponse>(apiResponse);
      setResponse(data);
      onSourceVideoPathChange(data.analysis.sourceVideoPath);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Vrew XML 분석에 실패했습니다.",
      );
      setResponse(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-[color:var(--glass)] ring-white/6 backdrop-blur-xl">
      <CardHeader className="flex flex-col gap-4 px-6 pt-6 md:flex-row md:items-end md:justify-between md:px-8 md:pt-8">
        <div className="space-y-2">
          <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.1rem]">
            Vrew XML 하이라이트
          </CardTitle>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Premiere용 Vrew XML을 그대로 두고, 자막 공백을 웃음/리액션 후보로 읽어 하이라이트 구간을 고릅니다.
          </p>
        </div>
        {response ? (
          <Badge variant="accent">
            후보 {response.analysis.candidates.length}개
          </Badge>
        ) : (
          <Badge variant="muted">Premiere XML</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-5 px-6 pb-6 md:px-8 md:pb-8">
        <div className="grid gap-4 rounded-[1.25rem] bg-surface-low/80 p-4 ring-1 ring-white/6 lg:grid-cols-[1.4fr_1fr_auto]">
          <div className="space-y-2">
            <label
              htmlFor="vrew-xml-path"
              className="block text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
            >
              Vrew XML
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <FileText className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="vrew-xml-path"
                  aria-label="Vrew XML path"
                  value={xmlPath}
                  onChange={(event) => onXmlPathChange(event.target.value)}
                  placeholder="/Volumes/.../vrew.xml"
                  disabled={busy}
                  className="pl-11"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || browsing}
                onClick={onBrowse}
                className="h-12 shrink-0 px-4"
              >
                {browsing ? "열기 중..." : "찾아보기"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              하이라이트 길이
            </p>
            <ToggleGroup
              type="single"
              value={durationPreset}
              onValueChange={(value) => {
                if (
                  value === "5" ||
                  value === "10" ||
                  value === "15" ||
                  value === "custom"
                ) {
                  setDurationPreset(value);
                }
              }}
              className="grid grid-cols-4 gap-2"
              aria-label="Highlight duration"
              disabled={busy}
            >
              <ToggleGroupItem value="5" size="lg" className="justify-center rounded-xl">
                ~5초
              </ToggleGroupItem>
              <ToggleGroupItem value="10" size="lg" className="justify-center rounded-xl">
                ~10초
              </ToggleGroupItem>
              <ToggleGroupItem value="15" size="lg" className="justify-center rounded-xl">
                ~15초
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" size="lg" className="justify-center rounded-xl">
                직접입력
              </ToggleGroupItem>
            </ToggleGroup>
            {durationPreset === "custom" ? (
              <Input
                aria-label="Custom highlight duration"
                inputMode="numeric"
                value={customDurationSeconds}
                onChange={(event) => setCustomDurationSeconds(event.target.value)}
                placeholder="초 단위"
                disabled={busy}
              />
            ) : null}
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              size="lg"
              disabled={busy}
              onClick={() => {
                void handleSubmit();
              }}
              className="w-full lg:w-auto"
            >
              <Sparkles className="size-4" />
              {busy ? "분석 중..." : "하이라이트 후보 생성"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {response ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{response.analysis.sequenceName}</Badge>
              <Badge variant="muted">{response.analysis.duration}</Badge>
              <Badge variant="muted">자막 {subtitleCount}개</Badge>
              <Badge variant="muted">공백 {gapCount}개</Badge>
            </div>

            <div className="grid gap-4 rounded-[1.25rem] bg-surface-low/80 p-4 ring-1 ring-white/6 lg:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <label
                  htmlFor="vrew-source-video-path"
                  className="block text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                >
                  원본 영상
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Clapperboard className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="vrew-source-video-path"
                      aria-label="Vrew source video path"
                      value={sourceVideoPath}
                      onChange={(event) =>
                        onSourceVideoPathChange(event.target.value)
                      }
                      placeholder="/Volumes/.../source.mp4"
                      disabled={busy}
                      className="pl-11"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || sourceVideoBrowsing}
                    onClick={onSourceVideoBrowse}
                    className="h-12 shrink-0 px-4"
                  >
                    {sourceVideoBrowsing ? "영상 열기 중..." : "영상 찾아보기"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Vrew highlight candidates">
              {response.analysis.candidates.map((candidate, index) => (
                <article
                  key={candidate.id}
                  className="overflow-hidden rounded-[1rem] bg-surface-low ring-1 ring-white/6"
                >
                  <div className="aspect-video overflow-hidden bg-black">
                    <video
                      aria-label={`Highlight ${index + 1} preview video`}
                      src={buildHighlightSegmentSrc({
                        videoPath: previewVideoPath,
                        start: candidate.start,
                        end: candidate.end,
                      })}
                      poster={buildPosterSrc({
                        videoPath: previewVideoPath,
                        start: candidate.start,
                        end: candidate.end,
                      })}
                      controls
                      preload="metadata"
                      playsInline
                      className="block size-full object-cover"
                    />
                  </div>

                  <div className="flex items-start justify-between gap-3 p-4 pb-0">
                    <div className="space-y-1">
                      <h3 className="font-heading text-lg tracking-[-0.03em]">
                        {candidate.start} ~ {candidate.end}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        기준 {candidate.anchor}
                      </p>
                    </div>
                    <Badge variant="accent">
                      공백 {candidate.gapDurationSeconds.toFixed(1)}초
                    </Badge>
                  </div>

                  <div className="space-y-3 p-4 text-sm leading-6">
                    <div className="rounded-xl bg-surface-high px-3 py-2">
                      <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                        직전 자막
                      </p>
                      <p>{candidate.previousSubtitle}</p>
                    </div>
                    <div className="rounded-xl bg-surface-high px-3 py-2">
                      <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                        직후 자막
                      </p>
                      <p>{candidate.nextSubtitle}</p>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {candidate.reason}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
