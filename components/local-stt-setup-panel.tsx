"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LocalSttStatusResponse } from "@/types/local-stt";

type LocalSttSetupPanelProps = {
  status: LocalSttStatusResponse | null;
  busy: boolean;
  onRefresh: () => void;
  onInstall: (fingerprint: string) => void;
  onRepair: () => void;
  onUninstall: () => void;
};

function formatBytes(value: number): string {
  const gib = 1024 * 1024 * 1024;
  const mib = 1024 * 1024;

  if (value >= gib) {
    return `${(value / gib).toFixed(1)} GB`;
  }

  return `${Math.max(1, Math.round(value / mib))} MB`;
}

function resolveBadgeVariant(
  status: NonNullable<LocalSttStatusResponse>["setup"]["status"],
) {
  switch (status) {
    case "ready":
      return "success";
    case "installing":
      return "warning";
    case "failed":
    case "unsupported":
      return "danger";
    default:
      return "secondary";
  }
}

function resolveStatusLabel(
  status: NonNullable<LocalSttStatusResponse>["setup"]["status"],
) {
  switch (status) {
    case "unsupported":
      return "지원 안 됨";
    case "not_installed":
      return "미설치";
    case "partial":
      return "일부 누락";
    case "installing":
      return "설치 중";
    case "ready":
      return "준비 완료";
    case "failed":
      return "오류";
  }
}

export function LocalSttSetupPanel({
  status,
  busy,
  onRefresh,
  onInstall,
  onRepair,
  onUninstall,
}: LocalSttSetupPanelProps) {
  const [showInstallPlan, setShowInstallPlan] = useState(false);
  const installPlan = status?.installPlan;
  const installActionsDisabled = busy || status?.setup.status === "installing";
  const missingCount = useMemo(
    () =>
      status?.setup.components.filter(
        (component) => !(component.installed && component.healthy),
      ).length ?? 0,
    [status],
  );

  if (!status) {
    return (
      <div className="rounded-[1.2rem] bg-surface-low/80 p-4 ring-1 ring-white/6">
        <p className="text-sm text-muted-foreground">로컬 전사 준비 상태를 확인 중입니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[1.2rem] bg-surface-low/80 p-4 ring-1 ring-white/6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={resolveBadgeVariant(status.setup.status)}>
              {resolveStatusLabel(status.setup.status)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              기본 모델: {status.setup.selectedModelLabel} · {status.setup.selectedModelId}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {status.setup.status === "ready"
              ? "관리형 로컬 STT 런타임이 준비되었습니다."
              : status.setup.status === "unsupported"
                ? status.setup.platform.reason ?? "현재 머신에서는 로컬 전사를 지원하지 않습니다."
                : status.setup.status === "installing"
                  ? `설치 중입니다. 현재 단계: ${status.setup.currentOperation?.stepKey ?? "작업 중"}`
                  : status.setup.status === "failed"
                    ? status.setup.lastError ?? "이전 설치가 완료되지 않았습니다. 수리를 다시 실행하세요."
                  : `설치가 필요한 항목 ${missingCount}개가 남아 있습니다.`}
          </p>
          <p className="text-xs text-muted-foreground">
            설치 위치: {status.setup.installRoot}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
            상태 새로고침
          </Button>
          {status.setup.status !== "unsupported" && installPlan ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setShowInstallPlan((current) => !current)}
            >
              {showInstallPlan ? "설치 항목 닫기" : "설치 항목 보기"}
            </Button>
          ) : null}
          {(status.setup.status === "partial" || status.setup.status === "failed") && (
            <Button type="button" size="sm" disabled={installActionsDisabled} onClick={onRepair}>
              수리
            </Button>
          )}
          {status.setup.status === "ready" && (
            <Button type="button" size="sm" disabled={installActionsDisabled} onClick={onUninstall}>
              제거
            </Button>
          )}
        </div>
      </div>

      {showInstallPlan && installPlan ? (
        <div className="space-y-3 rounded-[1rem] bg-surface-highest/80 p-4 ring-1 ring-white/8">
          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
            <p>총 다운로드: {formatBytes(installPlan.totalDownloadBytes)}</p>
            <p>총 설치 용량: {formatBytes(installPlan.totalInstallBytes)}</p>
            <p>남은 디스크 공간: {formatBytes(installPlan.freeDiskBytes)}</p>
          </div>

          <div className="space-y-2">
            {installPlan.items.map((item) => (
              <div
                key={item.key}
                className="rounded-xl bg-surface-low px-3 py-3 ring-1 ring-white/6"
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.version}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.purpose}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  다운로드 {formatBytes(item.downloadBytes)} · 설치 후 {formatBytes(item.installBytes)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.sourceLabel} · {item.installPath}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              확인 후에만 설치가 시작됩니다. 현재 머신에 필요한 항목만 관리형 경로에 설치합니다.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={installActionsDisabled || status.setup.status === "unsupported"}
              onClick={() => onInstall(installPlan.fingerprint)}
            >
              설치 시작
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
