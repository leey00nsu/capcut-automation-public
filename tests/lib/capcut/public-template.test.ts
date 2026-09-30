import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBuiltInTemplateProjectPath } from "@/lib/capcut/template-project";

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : Promise.resolve([path]);
  }));
  return paths.flat();
}

function inspectTemplate(value: unknown): void {
  if (typeof value === "string") {
    expect(value).not.toMatch(/\/Users\/|\/Volumes\//);
    if (value.startsWith("{") || value.startsWith("[")) {
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { return; }
      inspectTemplate(parsed);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(inspectTemplate);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["device_id", "user_id", "email"]) {
      if (key in record) expect(record[key]).toBe("");
    }
    if (typeof record.text === "string" && record.text && Array.isArray(record.styles)) {
      for (const style of record.styles) {
        if (style.range) expect(style.range).toEqual([0, record.text.length]);
      }
    }
    Object.values(record).forEach(inspectTemplate);
  }
}

describe("public CapCut template assets", () => {
  it("contains portable JSON and synthetic covers without cached audio or personal paths", async () => {
    const files = await filesIn(getBuiltInTemplateProjectPath());
    expect(files.some((path) => /\.(wav|mp3|mp4|mov)$/i.test(path))).toBe(false);
    const dataFiles = files.filter((path) => /\.(json|tmp|bak)$/.test(path));
    expect(dataFiles.length).toBeGreaterThan(0);
    for (const path of dataFiles) {
      inspectTemplate(JSON.parse(await readFile(path, "utf8")));
    }
  });
});
