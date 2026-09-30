import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BrowserWindow } from "electrobun/bun";

const APP_URL = "http://127.0.0.1:4123/";
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = "4123";
const SERVER_READY_TIMEOUT_MS = 30_000;
const isMac = process.platform === "darwin";

type SpawnedServer = ReturnType<typeof Bun.spawn>;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parentDirectories(startDirectory: string, limit = 8): string[] {
  const directories: string[] = [];
  let current = resolve(startDirectory);

  for (let index = 0; index < limit; index += 1) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return directories;
}

function getStandaloneCandidates(): string[] {
  const explicitDirectory = process.env.CAPCUT_AUTOMATION_STANDALONE_DIR;
  const bases = unique([
    process.cwd(),
    import.meta.dir,
    ...parentDirectories(process.cwd()),
    ...parentDirectories(import.meta.dir),
  ]);

  return unique([
    explicitDirectory ? resolve(explicitDirectory) : "",
    ...bases.map((base) => join(base, "next-standalone")),
    ...bases.map((base) => join(base, "Resources", "next-standalone")),
    ...bases.map((base) => join(base, "Contents", "Resources", "next-standalone")),
  ]);
}

function findStandaloneDirectory(): string {
  for (const candidate of getStandaloneCandidates()) {
    if (existsSync(join(candidate, "server.js"))) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find next-standalone/server.js. Run `npm run desktop:prepare` from the project root before launching the desktop app.",
  );
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await Bun.sleep(250);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function startStandaloneServer(standaloneDirectory: string): SpawnedServer {
  const runtime = process.env.CAPCUT_AUTOMATION_SERVER_RUNTIME ?? process.execPath;
  const serverPath = join(standaloneDirectory, "server.js");

  return Bun.spawn([runtime, serverPath], {
    cwd: standaloneDirectory,
    env: {
      ...process.env,
      HOSTNAME: SERVER_HOST,
      PORT: SERVER_PORT,
      NODE_ENV: "production",
      CAPCUT_AUTOMATION_DATA_ROOT: process.env.CAPCUT_AUTOMATION_DATA_ROOT
        ?? join(homedir(), "Library", "Application Support", "capcut-automation"),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: "CapCut Automation",
    url: "views://mainview/index.html",
    frame: {
      width: 1440,
      height: 900,
      x: 120,
      y: 120,
    },
    titleBarStyle: isMac ? "hiddenInset" : "default",
    styleMask: isMac
      ? {
          UnifiedTitleAndToolbar: true,
          FullSizeContentView: true,
        }
      : {},
    transparent: false,
  });

  mainWindow.webview.on("dom-ready", () => {
    console.log("CapCut Automation shell loaded");
  });

  return mainWindow;
}

let serverProcess: SpawnedServer | undefined;

try {
  const standaloneDirectory = findStandaloneDirectory();
  serverProcess = startStandaloneServer(standaloneDirectory);
  console.log(`CapCut Automation server starting from ${standaloneDirectory}`);

  await waitForServer(APP_URL, SERVER_READY_TIMEOUT_MS);
  createMainWindow();

  console.log(`appbun wrapper started for ${APP_URL}`);
} catch (error) {
  console.error(error);
  serverProcess?.kill();
  throw error;
}
