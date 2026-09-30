import { readFile } from "node:fs/promises";

export async function readTranscript(path: string): Promise<string> {
  return readFile(path, "utf8");
}
