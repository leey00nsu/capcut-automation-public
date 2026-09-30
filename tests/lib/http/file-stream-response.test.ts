import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createFileStreamResponse } from "@/lib/http/file-stream-response";

class MockNodeStream extends EventEmitter {
  destroy = vi.fn();
}

describe("createFileStreamResponse", () => {
  it("destroys the node stream when the response body is canceled", async () => {
    const stream = new MockNodeStream();
    const response = createFileStreamResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
      },
    });

    const reader = response.body?.getReader();

    expect(reader).toBeDefined();

    await reader?.cancel();

    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });

  it("ignores late data and errors after the stream has been canceled", async () => {
    const stream = new MockNodeStream();
    const response = createFileStreamResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
      },
    });

    const reader = response.body?.getReader();

    await reader?.cancel();

    expect(() => {
      stream.emit("data", Buffer.from("late"));
      stream.emit("error", new Error("late error"));
      stream.emit("end");
    }).not.toThrow();
  });
});
