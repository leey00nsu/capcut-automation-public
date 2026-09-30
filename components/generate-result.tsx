"use client";

import { useEffect, useState } from "react";

import type { ReviewedClip } from "@/components/clip-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectGenerationResult } from "@/types/project";

type GenerateResultProps = {
  result: ProjectGenerationResult | null;
  clips: ReviewedClip[];
};

function pathName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function GenerateResult({ result, clips }: GenerateResultProps) {
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [openMessages, setOpenMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    setOpeningPath(null);
    setOpenMessages({});
  }, [result?.runId]);

  if (!result) {
    return null;
  }

  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));

  return (
    <Card className="bg-surface/95 ring-white/6">
      <CardHeader className="flex flex-col gap-4 px-6 pt-6 md:flex-row md:items-end md:justify-between md:px-8 md:pt-8">
        <div className="space-y-2">
          <CardTitle className="font-heading text-3xl tracking-[-0.03em] sm:text-[2.1rem]">
            생성 결과
          </CardTitle>
        </div>
        <Badge variant="muted">{result.projects.length}개 생성</Badge>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-6 md:px-8 md:pb-8">
        {result.projects.length > 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            원본 영상을 그대로 참조하므로 파일 위치를 유지하고 외장 디스크를 연결해 두세요.
            CapCut에서 파일 접근 오류가 나면 미디어 → 가져오기 → 장치에서 원본을 선택한 뒤
            프로젝트를 새로 생성하세요.
          </p>
        ) : null}
        {result.warnings && result.warnings.length > 0 ? (
          <section className="space-y-3 rounded-[1.25rem] bg-surface-low px-5 py-5 ring-1 ring-white/6">
            <div className="flex items-center gap-3">
              <Badge variant="warning">Warnings</Badge>
            </div>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {result.failures.length > 0 ? (
          <section className="space-y-3 rounded-[1.25rem] bg-surface-low px-5 py-5 ring-1 ring-danger/18">
            <div className="flex items-center gap-3">
              <Badge variant="danger">Failures</Badge>
            </div>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {result.failures.map((failure) => (
                <li key={failure.selectionId}>
                  <strong className="text-foreground">{failure.selectionId}</strong> ·{" "}
                  {failure.reason}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {result.projects.map((project) => {
            const clip = clipMap.get(project.selectionId);
            const message = openMessages[project.projectPath];
            const isOpening = openingPath === project.projectPath;

            return (
              <article
                key={project.projectPath}
                className="rounded-[1.35rem] bg-surface-high px-5 py-5 shadow-[0_18px_40px_rgba(14,14,14,0.12)] ring-1 ring-white/6 md:px-6"
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <p className="font-heading text-2xl leading-none tracking-[-0.03em]">
                        {pathName(project.projectPath)}
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {clip ? `${clip.start} ~ ${clip.end}` : project.selectionId}
                      </p>
                    </div>
                  </div>

                  <p className="line-clamp-2 break-all text-sm leading-7 text-muted-foreground">
                    {project.projectPath}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isOpening}
                    onClick={async () => {
                      setOpeningPath(project.projectPath);
                      setOpenMessages((current) => ({
                        ...current,
                        [project.projectPath]: "Finder를 여는 중...",
                      }));

                      try {
                        const response = await fetch("/api/open-in-finder", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ path: project.projectPath }),
                        });

                        const body = (await response.json()) as
                          | { error?: { message?: string } }
                          | { ok?: boolean };

                        if (!response.ok) {
                          throw new Error(
                            "error" in body && body.error?.message
                              ? body.error.message
                              : "Finder를 열 수 없습니다",
                          );
                        }

                        setOpenMessages((current) => ({
                          ...current,
                          [project.projectPath]: "Finder에서 열었습니다",
                        }));
                      } catch (error) {
                        setOpenMessages((current) => ({
                          ...current,
                          [project.projectPath]:
                            error instanceof Error ? error.message : "열기 실패",
                        }));
                      } finally {
                        setOpeningPath(null);
                      }
                    }}
                  >
                    {isOpening ? "열기 중..." : "Finder에서 열기"}
                  </Button>

                  {message ? (
                    <p className="text-sm leading-6 text-muted-foreground">{message}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
