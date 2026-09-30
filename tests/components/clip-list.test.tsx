import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReviewedClip } from "@/components/clip-state";
import { ClipList } from "@/components/clip-list";

function createClip(): ReviewedClip {
  return {
    id: "short-001",
    start: "00:01:09.366",
    end: "00:01:36.800",
    reason: "독립적으로 이해되고 첫 문장이 강합니다.",
    topHighlightCandidates: ["강조 1", "강조 2", "강조 3"],
    topGeneralCandidates: ["본문 1", "본문 2", "본문 3"],
    enabled: true,
    topHighlightText: "강조 1",
    topGeneralText: "본문 1",
    channelNameText: "예시 채널",
    titleText: "원본 제목",
  };
}

describe("ClipList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a single shorts preview stage with a video.js-backed local video player", () => {
    render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={vi.fn()}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    const previewStage = screen.getByRole("group", {
      name: "Clip 1 shorts preview",
    });
    const previewVideo = within(previewStage).getByLabelText(
      "Clip 1 shorts preview video",
    );

    expect(previewVideo).toHaveAttribute(
      "src",
      "/api/local-video?path=%2Fvideos%2Fsource.mp4",
    );
    expect(previewVideo).toHaveAttribute(
      "poster",
      "/api/local-video/poster?path=%2Fvideos%2Fsource.mp4&time=83.083",
    );
    expect(
      within(previewStage).getByRole("button", { name: "Clip 1 preview play" }),
    ).toBeInTheDocument();
    expect(
      within(previewStage).getByTestId("clip-preview-controls"),
    ).toHaveClass("opacity-0");
    expect(
      within(previewStage).getByTestId("clip-preview-controls"),
    ).toHaveClass("group-hover:opacity-100");
    expect(
      within(previewStage).getByTestId("clip-preview-controls"),
    ).not.toHaveClass("group-focus-within:opacity-100");
    expect(within(previewStage).getByLabelText("Clip 1 preview scrubber")).toHaveAttribute(
      "max",
      "27.434",
    );
    expect(within(previewStage).getByText("0:00 / 0:27")).toBeInTheDocument();
    expect(previewStage.className).toContain("[container-type:inline-size]");
    expect(within(previewStage).getByAltText("채널 이미지 프리뷰")).toHaveAttribute(
      "src",
      "/api/local-image?path=%2Fimages%2Fchannel.png",
    );
    expect(within(previewStage).getAllByText("강조 1")).toHaveLength(2);
    expect(within(previewStage).getByText("본문 1")).toBeInTheDocument();
    expect(within(previewStage).getByText("예시 채널")).toBeInTheDocument();
    expect(within(previewStage).getByText("원본 제목")).toBeInTheDocument();
  });

  it("lays out clip candidates in a dense responsive grid", () => {
    render(
      <ClipList
        clips={[createClip(), { ...createClip(), id: "short-002" }]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={vi.fn()}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    const candidateList = screen.getAllByRole("list", {
      name: "clip candidates",
    })[0];
    const firstCard = candidateList.querySelector("article");

    expect(candidateList).toHaveClass("grid-cols-3");
    expect(candidateList).toHaveClass("xl:grid-cols-4");
    expect(firstCard).not.toHaveClass("max-w-[1180px]");
  });

  it("shows the clip range as start ~ end", () => {
    render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={vi.fn()}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    expect(
      screen.getByText("00:01:09.366 ~ 00:01:36.800"),
    ).toBeInTheDocument();
    expect(screen.getByText("27.4초")).toBeInTheDocument();
  });

  it("renders candidate chips as fully rounded pills", () => {
    render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={vi.fn()}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    const chip = screen.getAllByRole("radio", {
      name: "Clip 1 highlight candidate 강조 1",
    })[0];

    expect(chip.className).toContain("rounded-full");
    expect(chip.className).not.toContain("group-data-[spacing=0]/toggle-group:rounded-none");
    expect(chip.className).not.toContain("first:rounded-l-lg");
    expect(chip.className).not.toContain("last:rounded-r-lg");
  });

  it("toggles generation when the card itself is clicked", () => {
    const onToggleEnabled = vi.fn();

    const view = render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={onToggleEnabled}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    fireEvent.click(view.getByText("00:01:09.366 ~ 00:01:36.800"));

    expect(onToggleEnabled).toHaveBeenCalledWith("short-001", false);
  });

  it("does not toggle generation when an inner candidate chip is clicked", () => {
    const onToggleEnabled = vi.fn();
    const onSelectTopHighlight = vi.fn();

    const view = render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={onToggleEnabled}
        onSelectTopHighlight={onSelectTopHighlight}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    const chip = view.getByRole("radio", {
      name: "Clip 1 highlight candidate 강조 2",
    });

    fireEvent.click(chip);

    expect(onSelectTopHighlight).toHaveBeenCalledWith("short-001", "강조 2");
    expect(onToggleEnabled).not.toHaveBeenCalled();
  });

  it("does not toggle generation when the preview video itself is clicked", () => {
    const onToggleEnabled = vi.fn();

    render(
      <ClipList
        clips={[createClip()]}
        videoPath="/videos/source.mp4"
        channelImagePath="/images/channel.png"
        onToggleEnabled={onToggleEnabled}
        onSelectTopHighlight={vi.fn()}
        onSelectTopGeneral={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Clip 1 shorts preview video"));

    expect(onToggleEnabled).not.toHaveBeenCalled();
  });
});
