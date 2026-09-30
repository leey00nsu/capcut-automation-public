import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { VrewHighlightPanel } from "@/components/vrew-highlight-panel";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  cleanup();
});

function mockSuccessResponse() {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      xmlPath: "/xml/vrew.xml",
      durationPreset: "10",
      highlightDurationSeconds: 10,
      analysis: {
        sourceVideoPath: "/videos/source.mp4",
        sequenceName: "sample",
        duration: "00:00:20.000",
        subtitles: [{ id: "subtitle-001" }],
        gaps: [{ id: "gap-001" }],
        candidates: [
          {
            id: "highlight-001",
            start: "00:00:01.000",
            end: "00:00:11.000",
            anchor: "00:00:08.000",
            durationSeconds: 10,
            gapDurationSeconds: 1.4,
            previousSubtitle: "이 말이 웃긴 포인트",
            nextSubtitle: "다음 반응",
            reason: "자막 공백 1.4초 구간을 웃음/리액션 후보로 감지했습니다.",
          },
        ],
      },
    }),
  });
}

function ControlledVrewHighlightPanel({
  initialXmlPath = "",
  initialSourceVideoPath = "",
  browsing = false,
  sourceVideoBrowsing = false,
  onBrowse = vi.fn(),
  onSourceVideoBrowse = vi.fn(),
}: {
  initialXmlPath?: string;
  initialSourceVideoPath?: string;
  browsing?: boolean;
  sourceVideoBrowsing?: boolean;
  onBrowse?: () => void;
  onSourceVideoBrowse?: () => void;
}) {
  const [xmlPath, setXmlPath] = useState(initialXmlPath);
  const [sourceVideoPath, setSourceVideoPath] = useState(initialSourceVideoPath);

  return (
    <VrewHighlightPanel
      xmlPath={xmlPath}
      browsing={browsing}
      onXmlPathChange={setXmlPath}
      onBrowse={onBrowse}
      sourceVideoPath={sourceVideoPath}
      sourceVideoBrowsing={sourceVideoBrowsing}
      onSourceVideoPathChange={setSourceVideoPath}
      onSourceVideoBrowse={onSourceVideoBrowse}
    />
  );
}

describe("VrewHighlightPanel", () => {
  it("submits an XML path and renders highlight candidates", async () => {
    mockSuccessResponse();

    render(<ControlledVrewHighlightPanel />);

    fireEvent.change(screen.getByLabelText("Vrew XML path"), {
      target: { value: "/xml/vrew.xml" },
    });
    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/premiere/vrew/highlights",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            xmlPath: "/xml/vrew.xml",
            durationPreset: "10",
          }),
        }),
      );
    });

    expect(await screen.findByText("00:00:01.000 ~ 00:00:11.000")).toBeInTheDocument();
    expect(screen.getByText("공백 1.4초")).toBeInTheDocument();
    expect(screen.getByText("이 말이 웃긴 포인트")).toBeInTheDocument();
    expect(screen.getByText("다음 반응")).toBeInTheDocument();
    expect(screen.getByLabelText("Highlight 1 preview video")).toHaveAttribute(
      "src",
      "/api/local-video/segment?path=%2Fvideos%2Fsource.mp4&start=1.000&end=11.000",
    );
    expect(screen.getByLabelText("Highlight 1 preview video")).toHaveAttribute(
      "poster",
      "/api/local-video/poster?path=%2Fvideos%2Fsource.mp4&time=6.000",
    );
  });

  it("auto-fills the source video path and uses manual changes for previews", async () => {
    mockSuccessResponse();

    render(<ControlledVrewHighlightPanel initialXmlPath="/xml/vrew.xml" />);

    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));

    const sourceInput = await screen.findByLabelText("Vrew source video path");
    expect(sourceInput).toHaveValue("/videos/source.mp4");

    fireEvent.change(sourceInput, {
      target: { value: "/videos/override.mp4" },
    });

    expect(screen.getByLabelText("Highlight 1 preview video")).toHaveAttribute(
      "src",
      "/api/local-video/segment?path=%2Fvideos%2Foverride.mp4&start=1.000&end=11.000",
    );
    expect(screen.getByLabelText("Highlight 1 preview video")).toHaveAttribute(
      "poster",
      "/api/local-video/poster?path=%2Fvideos%2Foverride.mp4&time=6.000",
    );
  });

  it("sends the selected preset duration", async () => {
    mockSuccessResponse();

    render(<ControlledVrewHighlightPanel />);

    fireEvent.change(screen.getByLabelText("Vrew XML path"), {
      target: { value: "/xml/vrew.xml" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "~15초" }));
    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/premiere/vrew/highlights",
        expect.objectContaining({
          body: JSON.stringify({
            xmlPath: "/xml/vrew.xml",
            durationPreset: "15",
          }),
        }),
      );
    });
  });

  it("sends a custom duration when direct input is selected", async () => {
    mockSuccessResponse();

    render(<ControlledVrewHighlightPanel />);

    fireEvent.change(screen.getByLabelText("Vrew XML path"), {
      target: { value: "/xml/vrew.xml" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "직접입력" }));
    fireEvent.change(screen.getByLabelText("Custom highlight duration"), {
      target: { value: "22" },
    });
    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/premiere/vrew/highlights",
        expect.objectContaining({
          body: JSON.stringify({
            xmlPath: "/xml/vrew.xml",
            durationPreset: "custom",
            customDurationSeconds: 22,
          }),
        }),
      );
    });
  });

  it("uses the shared file picker trigger for XML browsing", () => {
    const onBrowse = vi.fn();

    render(<ControlledVrewHighlightPanel browsing onBrowse={onBrowse} />);

    fireEvent.click(screen.getByRole("button", { name: "열기 중..." }));

    expect(onBrowse).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "열기 중..." })).toBeDisabled();

    cleanup();

    render(<ControlledVrewHighlightPanel onBrowse={onBrowse} />);
    fireEvent.click(screen.getByRole("button", { name: "찾아보기" }));

    expect(onBrowse).toHaveBeenCalledTimes(1);
  });

  it("uses the shared file picker trigger for source video browsing", async () => {
    const onSourceVideoBrowse = vi.fn();
    mockSuccessResponse();

    render(
      <ControlledVrewHighlightPanel
        initialXmlPath="/xml/vrew.xml"
        sourceVideoBrowsing
        onSourceVideoBrowse={onSourceVideoBrowse}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));

    expect(await screen.findByLabelText("Vrew source video path")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "영상 열기 중..." }));

    expect(onSourceVideoBrowse).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "영상 열기 중..." })).toBeDisabled();

    cleanup();
    mockSuccessResponse();

    render(
      <ControlledVrewHighlightPanel
        initialXmlPath="/xml/vrew.xml"
        onSourceVideoBrowse={onSourceVideoBrowse}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "하이라이트 후보 생성" }));
    expect(await screen.findByLabelText("Vrew source video path")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "영상 찾아보기" }));

    expect(onSourceVideoBrowse).toHaveBeenCalledTimes(1);
  });
});
