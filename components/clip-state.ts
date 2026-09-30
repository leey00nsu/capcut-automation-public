import type { PlanResponse, PlannerClip } from "@/types/planner";
import type { ProjectGenerationRequest, ProjectSelection } from "@/types/project";

export type ReviewedClip = PlannerClip & {
  enabled: boolean;
  topHighlightText: string;
  topGeneralText: string;
  channelNameText: string;
  titleText: string;
};

function firstCandidate(values: string[]): string {
  return values[0]?.trim() ?? "";
}

function buildTitleText(originalTitle: string, channelName: string): string {
  const safeOriginalTitle = originalTitle.trim();

  if (!safeOriginalTitle) {
    return channelName.trim();
  }

  return safeOriginalTitle;
}

function normalizeClipId(id: string, index: number): string {
  const trimmedId = id.trim();

  return trimmedId.length > 0 ? trimmedId : `clip-${index + 1}`;
}

function uniqueClipId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;

  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  usedIds.add(candidate);
  return candidate;
}

export function createReviewedClips(
  plan: Pick<PlanResponse, "source" | "clips"> & { planId?: string },
): ReviewedClip[] {
  const usedIds = new Set<string>();

  return plan.clips.map((clip, index) => {
    const id = uniqueClipId(normalizeClipId(clip.id, index), usedIds);

    return {
      ...clip,
      id,
      enabled: true,
      topHighlightText: firstCandidate(clip.topHighlightCandidates),
      topGeneralText: firstCandidate(clip.topGeneralCandidates),
      channelNameText: plan.source.channelName,
      titleText: buildTitleText(
        plan.source.originalTitle,
        plan.source.channelName,
      ),
    };
  });
}

function toProjectSelection(clip: ReviewedClip): ProjectSelection {
  return {
    id: clip.id,
    enabled: clip.enabled,
    start: clip.start,
    end: clip.end,
    topHighlightText: clip.topHighlightText,
    topGeneralText: clip.topGeneralText,
    channelNameText: clip.channelNameText,
    titleText: clip.titleText,
  };
}

export function buildGenerationRequest(input: {
  planId: string;
  videoPath: string;
  originalTitle: string;
  profileImagePath?: string;
  clips: ReviewedClip[];
}): ProjectGenerationRequest {
  return {
    planId: input.planId,
    videoPath: input.videoPath,
    originalTitle: input.originalTitle,
    ...(input.profileImagePath?.trim()
      ? { profileImagePath: input.profileImagePath.trim() }
      : {}),
    selections: input.clips.map(toProjectSelection),
  };
}
