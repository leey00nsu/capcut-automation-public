import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const { POST } = await import("@/app/api/sessions/route");
const { GET } = await import("@/app/api/sessions/[sessionId]/route");

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("session routes", () => {
  it("creates a persisted session from valid source input", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-route-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const response = await POST(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoPath,
          channelName: "예시 채널",
          channelImagePath: "/images/channel.png",
          originalTitle: "원본 제목",
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sessionId: expect.any(String),
      source: {
        videoPath,
        channelName: "예시 채널",
        channelImagePath: "/images/channel.png",
        originalTitle: "원본 제목",
      },
      jobs: [],
    });

    createdPaths.push(body.rootPath as string);
  });

  it("loads a previously created session by session id", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "capcut-session-route-"));
    createdPaths.push(tempDirectory);
    const videoPath = join(tempDirectory, "video.mp4");
    await writeFile(videoPath, "fake video", "utf8");

    const createResponse = await POST(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoPath,
          channelName: "예시 채널",
          originalTitle: "원본 제목",
        }),
      }),
    );
    const created = await createResponse.json();
    createdPaths.push(created.rootPath as string);

    const response = await GET(
      new Request(`http://localhost/api/sessions/${created.sessionId}`),
      {
        params: Promise.resolve({
          sessionId: created.sessionId as string,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: created.sessionId,
      source: {
        videoPath,
        channelName: "예시 채널",
      },
    });
  });
});
