import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const { POST } = await import("@/app/api/premiere/vrew/highlights/route");

const tempDirectories: string[] = [];

async function createXmlFile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "capcut-vrew-"));
  const filePath = join(directory, "vrew.xml");
  tempDirectories.push(directory);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/premiere/vrew/highlights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const xmlFixture = `<?xml version="1.0" encoding="utf-8"?>
<xmeml version="5">
  <sequence>
    <name>sample</name>
    <duration>900</duration>
    <rate><timebase>60</timebase></rate>
    <media><video>
      <track>
        <clipitem><file><pathurl>/Volumes/source/source.mp4</pathurl></file></clipitem>
      </track>
      <track>
        <generatoritem><start>0</start><end>120</end><effect><parameter><parameterid>str</parameterid><name>Text</name><value>첫 대사</value></parameter></effect></generatoritem>
        <generatoritem><start>210</start><end>300</end><effect><parameter><parameterid>str</parameterid><name>Text</name><value>둘째 대사</value></parameter></effect></generatoritem>
      </track>
    </video></media>
  </sequence>
</xmeml>`;

describe("POST /api/premiere/vrew/highlights", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns highlight candidates for a valid Vrew XML path", async () => {
    const xmlPath = await createXmlFile(xmlFixture);

    const response = await POST(
      request({
        xmlPath,
        durationPreset: "10",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      xmlPath,
      durationPreset: "10",
      highlightDurationSeconds: 10,
      analysis: {
        sourceVideoPath: "/Volumes/source/source.mp4",
        candidates: [
          {
            id: "highlight-001",
            start: "00:00:00.000",
            end: "00:00:10.000",
            previousSubtitle: "첫 대사",
            nextSubtitle: "둘째 대사",
          },
        ],
      },
    });
  });

  it("accepts a custom highlight duration", async () => {
    const xmlPath = await createXmlFile(xmlFixture);

    const response = await POST(
      request({
        xmlPath,
        durationPreset: "custom",
        customDurationSeconds: 12,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlightDurationSeconds).toBe(12);
  });

  it("uses a colocated source video when the XML pathurl is stale", async () => {
    const directory = await createTempDirectory("capcut-vrew-stale-path-");
    const xmlPath = join(directory, "vrew.xml");
    const sourceVideoPath = join(directory, "source.mp4");
    const staleXml = xmlFixture.replace(
      "/Volumes/source/source.mp4",
      "/missing/source.mp4",
    );
    await writeFile(xmlPath, staleXml, "utf8");
    await writeFile(sourceVideoPath, "fake mp4", "utf8");

    const response = await POST(
      request({
        xmlPath,
        durationPreset: "10",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.sourceVideoPath).toBe(sourceVideoPath);
  });

  it("returns 400 for a missing XML path", async () => {
    const response = await POST(request({ durationPreset: "5" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });

  it("returns 400 for an invalid custom duration", async () => {
    const xmlPath = await createXmlFile(xmlFixture);
    const response = await POST(
      request({
        xmlPath,
        durationPreset: "custom",
        customDurationSeconds: 0,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });
});
