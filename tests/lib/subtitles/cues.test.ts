import { describe, expect, it } from "vitest";
import { clipSubtitleCues, parseTranscriptCues } from "@/lib/subtitles/cues";

describe("transcript subtitles", () => {
  it("reads generated transcript text and clips across both selection boundaries", () => {
    const cues = parseTranscriptCues("[00:00:04.000 - 00:00:07.000] 앞 대사\n[00:00:09.000 - 00:00:12.000] 뒤 대사");
    expect(clipSubtitleCues(cues, 5, 10)).toEqual([
      { start: 0, end: 2, text: "앞 대사" }, { start: 4, end: 5, text: "뒤 대사" },
    ]);
  });
  it("reads multiline SRT and VTT and replaces rolling captions without overlap", () => {
    const cues = parseTranscriptCues("WEBVTT\n\n00:00:01.000 --> 00:00:04.000 align:start\n<b>Hello</b> &amp;\nworld\n\n2\n00:00:03,000 --> 00:00:05,000\nNext caption\n");
    expect(cues).toEqual([{ start: 1, end: 3, text: "Hello & world" }, { start: 3, end: 5, text: "Next caption" }]);
  });
  it("splits long Unicode text without dropping characters or leaving gaps", () => {
    const text = "가나다라마바사아자차카타파하".repeat(8);
    const cues = parseTranscriptCues(`[00:00:00.000 - 00:00:08.000] ${text}`);
    expect(cues.map((cue) => cue.text).join("")).toBe(text);
    expect(cues[0].start).toBe(0); expect(cues.at(-1)?.end).toBe(8);
    expect(cues.every((cue, index) => cue.end > cue.start && (!index || cue.start === cues[index - 1].end))).toBe(true);
  });
  it("rejects missing and invalid timestamps", () => {
    expect(() => parseTranscriptCues("just text")).toThrow("타임코드");
    expect(() => parseTranscriptCues("[00:00:05.000 - 00:00:01.000] bad")).toThrow();
    expect(() => parseTranscriptCues("[00:80:00.000 - 00:90:00.000] bad")).toThrow();
  });
  it("accepts short VTT timestamps and transcript timestamps without milliseconds", () => {
    expect(parseTranscriptCues("00:01.200 --> 00:03.400\nShort VTT\n")).toEqual([{ start: 1.2, end: 3.4, text: "Short VTT" }]);
    expect(parseTranscriptCues("[00:00:01 - 00:00:03] plain timing")).toEqual([{ start: 1, end: 3, text: "plain timing" }]);
  });
});
