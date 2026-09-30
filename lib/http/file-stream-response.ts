type StreamLike = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  destroy(error?: Error): unknown;
};

type ResponseInitLike = {
  status: number;
  headers: HeadersInit;
};

export function createFileStreamResponse(
  stream: StreamLike,
  init: ResponseInitLike,
): Response {
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const handleData = (chunk: string | Buffer) => {
        if (closed) {
          return;
        }

        const buffer =
          typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buffer));
      };
      const handleDataEvent = (chunk: unknown) => {
        const normalized =
          typeof chunk === "string" || Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from([]);
        handleData(normalized);
      };

      const handleEnd = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      const handleError = (error: unknown) => {
        if (closed) {
          return;
        }

        closed = true;
        controller.error(error);
      };

      stream.on("data", handleDataEvent);
      stream.on("end", handleEnd);
      stream.on("error", handleError);

      const cleanup = () => {
        stream.off("data", handleDataEvent);
        stream.off("end", handleEnd);
        stream.off("error", handleError);
      };

      stream.on("close", cleanup);
    },
    cancel() {
      if (closed) {
        return;
      }

      closed = true;
      stream.destroy();
    },
  });

  return new Response(body, init);
}
