import { beforeEach, describe, expect, it, vi } from "vitest";

const { pickPathMock } = vi.hoisted(() => ({
  pickPathMock: vi.fn(),
}));

vi.mock("@/lib/files/pick-path", () => ({
  pickPath: pickPathMock,
}));

const { POST } = await import("@/app/api/pick-path/route");

describe("POST /api/pick-path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the selected path for a valid request", async () => {
    pickPathMock.mockResolvedValueOnce("/tmp/source.mp4");

    const response = await POST(
      new Request("http://localhost/api/pick-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "file",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canceled: false,
      path: "/tmp/source.mp4",
    });
    expect(pickPathMock).toHaveBeenCalledWith("file");
  });

  it("returns canceled true when the picker is canceled", async () => {
    pickPathMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/pick-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "directory",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canceled: true,
    });
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/pick-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });

  it("returns 500 when the picker fails", async () => {
    pickPathMock.mockRejectedValueOnce(new Error("osascript failed"));

    const response = await POST(
      new Request("http://localhost/api/pick-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "file",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PATH_PICKER_ERROR",
        message: "osascript failed",
      },
    });
  });
});
