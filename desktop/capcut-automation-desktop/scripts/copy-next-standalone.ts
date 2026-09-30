import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const desktopProjectRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(desktopProjectRoot, "..", "..");
const standaloneSource = join(repositoryRoot, ".next", "standalone");
const nextStaticSource = join(repositoryRoot, ".next", "static");
function findAppBundlePath(): string {
  if (process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH) {
    return process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  }

  const buildDirectory = resolve(
    process.env.ELECTROBUN_BUILD_DIR ?? join(desktopProjectRoot, "build"),
  );
  const configuredName = process.env.ELECTROBUN_APP_NAME ?? "CapCut Automation";
  const candidates = [
    join(buildDirectory, `${configuredName}.app`),
    join(buildDirectory, "CapCut Automation.app"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "Contents", "Resources"))) {
      return candidate;
    }
  }

  for (const entry of readdirSync(buildDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return join(buildDirectory, entry.name);
    }
  }

  return candidates[0];
}

const bundlePath = findAppBundlePath();
const resourcesPath = join(bundlePath, "Contents", "Resources");
const standaloneDestination = join(resourcesPath, "next-standalone");

function copyRequiredDirectory(source: string, destination: string): void {
  if (!existsSync(source)) {
    console.error(`Required directory not found: ${source}`);
    process.exit(1);
  }

  cpSync(source, destination, {
    recursive: true,
    force: true,
  });
}

function copyOptionalDirectory(source: string, destination: string): void {
  if (!existsSync(source)) {
    return;
  }

  cpSync(source, destination, {
    recursive: true,
    force: true,
  });
}

if (!existsSync(join(standaloneSource, "server.js"))) {
  console.error(
    `Next standalone server not found at ${join(
      standaloneSource,
      "server.js",
    )}. Run \`npm run build\` from the repository root first.`,
  );
  process.exit(1);
}

if (!existsSync(resourcesPath)) {
  console.error(`App resources directory not found: ${resourcesPath}`);
  process.exit(1);
}

rmSync(standaloneDestination, {
  force: true,
  recursive: true,
});
mkdirSync(standaloneDestination, {
  recursive: true,
});

copyRequiredDirectory(standaloneSource, standaloneDestination);
copyRequiredDirectory(nextStaticSource, join(standaloneDestination, ".next", "static"));
copyOptionalDirectory(join(repositoryRoot, "public"), join(standaloneDestination, "public"));
copyRequiredDirectory(join(repositoryRoot, "templates"), join(standaloneDestination, "templates"));
copyOptionalDirectory(
  join(repositoryRoot, "scripts", "local-stt"),
  join(standaloneDestination, "scripts", "local-stt"),
);

console.log(`Copied Next standalone server to ${standaloneDestination}`);
