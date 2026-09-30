import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { repairLocalSttMock } = vi.hoisted(() => ({
  repairLocalSttMock: vi.fn(),
}));

vi.mock("@/lib/local-stt/install", () => ({
  repairLocalStt: repairLocalSttMock,
}));

const { POST } = await import("@/app/api/local-stt/repair/route");

describe("POST /api/local-stt/repair", () => {
  beforeEach(() => {
    repairLocalSttMock.mockResolvedValue({
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
    repairLocalSttMock.mockReset();
  });

  it("repairs the managed local stt runtime", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(repairLocalSttMock).toHaveBeenCalledOnce();
  });
});
