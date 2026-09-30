import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = process.cwd();
const repositoryRoot = resolve(root, "..", "..");
const buildRoot = resolve(root, "build");
const appName = "CapCut Automation.app";
const wrapperAppPath = join(buildRoot, "stable-macos-arm64", appName);
const expandedDirectory = join(buildRoot, "expanded-macos-arm64");
const expandedAppPath = join(expandedDirectory, appName);
const tempDirectory = join(tmpdir(), `capcut-automation-expanded-${Date.now()}`);
const tempAppPath = join(tempDirectory, appName);

if (process.platform !== "darwin") {
  fail("platform", "prepare-expanded-app is only available on macOS.");
}

if (!existsSync(join(wrapperAppPath, "Contents", "MacOS", "launcher"))) {
  fail("missing-wrapper", `No self-extracting app found at ${wrapperAppPath}. Run npm run build:stable first.`);
}

rmSync(tempDirectory, { force: true, recursive: true });
mkdirSync(tempDirectory, { recursive: true });
cpSync(wrapperAppPath, tempAppPath, { recursive: true });

const launchResult = spawnSync(join(tempAppPath, "Contents", "MacOS", "launcher"), {
  cwd: tempDirectory,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (launchResult.status !== 0) {
  fail(
    "self-extract-failed",
    `${launchResult.stdout || ""}\n${launchResult.stderr || ""}`.trim(),
  );
}

if (!existsSync(join(tempAppPath, "Contents", "Resources", "main.js"))) {
  fail("missing-expanded-app", `Self extraction did not create the full app at ${tempAppPath}.`);
}

rmSync(expandedDirectory, { force: true, recursive: true });
mkdirSync(expandedDirectory, { recursive: true });
cpSync(tempAppPath, expandedAppPath, { recursive: true });
copyStandaloneRuntime(join(expandedAppPath, "Contents", "Resources", "next-standalone"));
rmSync(tempDirectory, { force: true, recursive: true });

console.log(`Prepared expanded app at ${expandedAppPath}`);

function copyStandaloneRuntime(destination) {
  const standaloneSource = join(repositoryRoot, ".next", "standalone");
  const nextStaticSource = join(repositoryRoot, ".next", "static");

  if (!existsSync(join(standaloneSource, "server.js"))) {
    fail("missing-standalone", `Next standalone server not found at ${join(standaloneSource, "server.js")}.`);
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  copyRequiredDirectory(standaloneSource, destination);
  copyRequiredDirectory(nextStaticSource, join(destination, ".next", "static"));
  copyOptionalDirectory(join(repositoryRoot, "public"), join(destination, "public"));
  copyRequiredDirectory(join(repositoryRoot, "templates"), join(destination, "templates"));
  copyOptionalDirectory(
    join(repositoryRoot, "scripts", "local-stt"),
    join(destination, "scripts", "local-stt"),
  );
}

function copyRequiredDirectory(source, destination) {
  if (!existsSync(source)) {
    fail("missing-directory", `Required directory not found: ${source}`);
  }

  cpSync(source, destination, {
    recursive: true,
    force: true,
  });
}

function copyOptionalDirectory(source, destination) {
  if (!existsSync(source)) {
    return;
  }

  cpSync(source, destination, {
    recursive: true,
    force: true,
  });
}

function fail(code, message) {
  console.error(`prepare-expanded-app error [${code}]`);
  console.error(message);
  process.exit(1);
}
