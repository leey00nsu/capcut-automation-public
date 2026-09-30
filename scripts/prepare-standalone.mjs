import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const standaloneRoot = join(root, ".next", "standalone");

if (!existsSync(join(standaloneRoot, "server.js"))) {
  throw new Error("Run npm run build before preparing the standalone server.");
}

for (const [source, destination] of [
  [".next/static", ".next/static"],
  ["public", "public"],
  ["templates", "templates"],
  ["scripts/local-stt", "scripts/local-stt"],
]) {
  const sourcePath = join(root, source);
  const destinationPath = join(standaloneRoot, destination);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing standalone asset directory: ${source}`);
  }
  rmSync(destinationPath, { recursive: true, force: true });
  cpSync(sourcePath, destinationPath, { recursive: true });
}

console.log("Prepared standalone server with templates, profile image, font, and transcription helper.");
