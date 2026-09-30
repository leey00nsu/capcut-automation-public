import { describe, expect, it } from "vitest";

import {
  analyzeVrewPremiereXml,
  buildHighlightCandidates,
  framesToTimecode,
} from "@/lib/premiere/vrew-xml";

const xmlFixture = `\uFEFF<?xml version="1.0" encoding="utf-8"?>
<xmeml version="5">
  <sequence id="video">
    <name>sample</name>
    <duration>900</duration>
    <rate><timebase>60</timebase><ntsc>false</ntsc></rate>
    <media>
      <video>
        <track>
          <clipitem>
            <name>source.mp4</name>
            <start>0</start><end>900</end><in>0</in><out>900</out>
            <file id="source.mp4">
              <pathurl>/Volumes/source/source.mp4</pathurl>
            </file>
          </clipitem>
        </track>
        <track>
          <generatoritem id="Outline Text1">
            <name>첫 번째 대사</name>
            <start>0</start><end>120</end><in>0</in><out>120</out>
            <effect>
              <parameter><parameterid>str</parameterid><name>Text</name><value>첫 번째 대사</value></parameter>
            </effect>
          </generatoritem>
          <generatoritem id="Outline Text2">
            <name>두 번째 대사</name>
            <start>210</start><end>300</end><in>210</in><out>300</out>
            <effect>
              <parameter><parameterid>str</parameterid><name>Text</name><value>\b두 번째 대사</value></parameter>
            </effect>
          </generatoritem>
          <generatoritem id="Outline Text3">
            <name>세 번째 대사</name>
            <start>420</start><end>540</end><in>420</in><out>540</out>
            <effect>
              <parameter><parameterid>str</parameterid><name>Text</name><value>세 번째 대사</value></parameter>
            </effect>
          </generatoritem>
        </track>
      </video>
    </media>
  </sequence>
</xmeml>`;

describe("Vrew Premiere XML analysis", () => {
  it("extracts source video, fps, duration, and sanitized subtitles", () => {
    const analysis = analyzeVrewPremiereXml(xmlFixture, {
      highlightDurationSeconds: 10,
    });

    expect(analysis.sourceVideoPath).toBe("/Volumes/source/source.mp4");
    expect(analysis.sequenceName).toBe("sample");
    expect(analysis.frameRate).toBe(60);
    expect(analysis.duration).toBe("00:00:15.000");
    expect(analysis.subtitles).toHaveLength(3);
    expect(analysis.subtitles.slice(0, 2)).toMatchObject([
      {
        id: "subtitle-001",
        text: "첫 번째 대사",
        start: "00:00:00.000",
        end: "00:00:02.000",
      },
      {
        id: "subtitle-002",
        text: "두 번째 대사",
        start: "00:00:03.500",
        end: "00:00:05.000",
      },
    ]);
  });

  it("detects subtitle gaps as laughter candidate anchors", () => {
    const analysis = analyzeVrewPremiereXml(xmlFixture, {
      highlightDurationSeconds: 10,
      minGapSeconds: 1,
    });

    expect(analysis.gaps).toMatchObject([
      {
        id: "gap-001",
        start: "00:00:02.000",
        end: "00:00:03.500",
        durationSeconds: 1.5,
        previousSubtitle: "첫 번째 대사",
        nextSubtitle: "두 번째 대사",
      },
      {
        id: "gap-002",
        start: "00:00:05.000",
        end: "00:00:07.000",
        durationSeconds: 2,
        previousSubtitle: "두 번째 대사",
        nextSubtitle: "세 번째 대사",
      },
    ]);
  });

  it("builds highlight windows with more lead-in than tail", () => {
    const candidates = buildHighlightCandidates(
      [
        {
          id: "gap-001",
          startFrame: 120,
          endFrame: 210,
          start: "00:00:02.000",
          end: "00:00:03.500",
          durationSeconds: 1.5,
          previousSubtitle: "첫 번째 대사",
          nextSubtitle: "두 번째 대사",
        },
      ],
      {
        frameRate: 60,
        sequenceDurationFrames: 900,
        highlightDurationSeconds: 10,
        subtitles: [],
      },
    );

    expect(candidates).toMatchObject([
      {
        id: "highlight-001",
        start: "00:00:00.000",
        end: "00:00:10.000",
        anchor: "00:00:02.750",
        durationSeconds: 10,
        gapDurationSeconds: 1.5,
      },
    ]);
  });

  it("formats fractional frames to millisecond timecodes", () => {
    expect(framesToTimecode(124.2, 60)).toBe("00:00:02.070");
  });
});
