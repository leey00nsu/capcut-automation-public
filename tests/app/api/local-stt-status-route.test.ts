import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveLocalSttStatusMock } = vi.hoisted(() => ({
  resolveLocalSttStatusMock: vi.fn(),
}));

vi.mock("@/lib/local-stt/status", () => ({
  resolveLocalSttStatus: resolveLocalSttStatusMock,
}));

const { GET } = await import("@/app/api/local-stt/status/route");

describe("GET /api/local-stt/status", () => {
  beforeEach(() => {
    resolveLocalSttStatusMock.mockResolvedValue({
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
      installPlan: {
        fingerprint: "fingerprint",
      },
    });
  });

  afterEach(() => {
    resolveLocalSttStatusMock.mockReset();
  });

  it("returns the current local stt setup state", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      setup: {
        status: "ready",
      },
      installPlan: {
        fingerprint: "fingerprint",
      },
    });
  });
});
