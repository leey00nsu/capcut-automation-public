import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { uninstallLocalSttMock } = vi.hoisted(() => ({
  uninstallLocalSttMock: vi.fn(),
}));

vi.mock("@/lib/local-stt/install", () => ({
  uninstallLocalStt: uninstallLocalSttMock,
}));

const { POST } = await import("@/app/api/local-stt/uninstall/route");

describe("POST /api/local-stt/uninstall", () => {
  beforeEach(() => {
    uninstallLocalSttMock.mockResolvedValue({
      setup: {
        status: "not_installed",
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
    uninstallLocalSttMock.mockReset();
  });

  it("removes the managed local stt runtime", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(uninstallLocalSttMock).toHaveBeenCalledOnce();
  });
});
