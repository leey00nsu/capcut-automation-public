import { spawnSync } from "node:child_process";

const target = process.argv[2];
const supportedTargets = ["macos", "windows", "linux"];

if (target === "all") {
  console.error("build:all is a CI matrix hint, not a local cross-compile command.");
  console.error("Run build:stable on native macOS, Windows, and Linux runners to produce platform artifacts.");
  process.exit(1);
}

if (!supportedTargets.includes(target)) {
  console.error("Usage: node scripts/build-platform.mjs <macos|windows|linux>");
  process.exit(1);
}

const hostTarget = process.platform === "darwin"
  ? "macos"
  : process.platform === "win32"
    ? "windows"
    : "linux";

if (hostTarget !== target) {
  console.error(`Electrobun builds should run on a native runner for this platform. Requested ${target}, current runner is ${hostTarget}.`);
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["electrobun", "build", "--env=stable"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
