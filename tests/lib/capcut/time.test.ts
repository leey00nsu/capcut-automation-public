import { describe, expect, it } from "vitest";

import { capCutUnitsToTimecode, timecodeToCapCutUnits } from "@/lib/capcut/time";

describe("time conversions", () => {
  it("converts zero timecode to CapCut units", () => {
    expect(timecodeToCapCutUnits("00:00:00.000")).toBe(0);
  });

  it("converts boundary-valid timecodes to CapCut units", () => {
    expect(timecodeToCapCutUnits("23:59:59.999")).toBe(86_399_999_000);
  });

  it("converts CapCut units back to zero timecode", () => {
    expect(capCutUnitsToTimecode(0)).toBe("00:00:00.000");
  });

  it("converts boundary-valid CapCut units back to timecode", () => {
    expect(capCutUnitsToTimecode(86_399_999_000)).toBe("23:59:59.999");
  });

  it("rejects invalid timecodes", () => {
    const invalidTimecodes = [
      "24:00:00.000",
      "00:60:00.000",
      "00:00:60.000",
      "00:00:00.1000",
      "00:00:00",
      "not-a-timecode",
    ];

    for (const value of invalidTimecodes) {
      expect(() => timecodeToCapCutUnits(value)).toThrow(
        `Invalid timecode: ${value}`,
      );
    }
  });

  it("rejects invalid CapCut units", () => {
    const invalidUnits = [-1, 1, 1000.5];

    for (const value of invalidUnits) {
      expect(() => capCutUnitsToTimecode(value)).toThrow(
        `Invalid CapCut time units: ${value}`,
      );
    }
  });
});
