import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { installLocalSttMock } = vi.hoisted(() => ({
  installLocalSttMock: vi.fn(),
}));

vi.mock("@/lib/local-stt/install", () => ({
  installLocalStt: installLocalSttMock,
  LocalSttConflictError: class LocalSttConflictError extends Error {},
}));

const { POST } = await import("@/app/api/local-stt/install/route");

describe("POST /api/local-stt/install", () => {
  beforeEach(() => {
    installLocalSttMock.mockResolvedValue({
      setup: {
        status: "ready",
        supported: true,
        platform: {
          os: "darwin",
          arch: "arm64",
        },
        installRoot: "/tmp/local-stt",
        selectedModelId: "mlx-community/whisper-medium",
        selectedModelLabel: "Balanced",
        components: [],
      },
    });
  });

  afterEach(() => {
    installLocalSttMock.mockReset();
  });

  it("rejects invalid request payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/local-stt/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns the updated setup state after installation", async () => {
    const response = await POST(
      new Request("http://localhost/api/local-stt/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acceptedPlanFingerprint: "accepted",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(installLocalSttMock).toHaveBeenCalledWith({
      acceptedPlanFingerprint: "accepted",
    });
  });
});
