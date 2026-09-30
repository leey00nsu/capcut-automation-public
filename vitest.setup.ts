import "@testing-library/jest-dom/vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

const testDataRoot = mkdtempSync(join(tmpdir(), "capcut-automation-vitest-"));
process.env.CAPCUT_AUTOMATION_DATA_ROOT = testDataRoot;

afterAll(() => {
  rmSync(testDataRoot, { recursive: true, force: true });
});

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
