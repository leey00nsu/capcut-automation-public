const APP_CONFIG = {
  "name": "CapCut Automation",
  "title": "CapCut Automation",
  "origin": "http://127.0.0.1:4123",
  "url": "http://127.0.0.1:4123/",
  "themeColor": "#24bc31",
  "titlebar": "unified",
  "showOrigin": true,
  "hasIcon": true,
  "iconSource": "appbun:fallback-icon"
};

const mount = document.getElementById("webview-mount");
const siteName = document.getElementById("site-name");
const siteOrigin = document.getElementById("site-origin");
const siteIcon = document.getElementById("site-icon") as HTMLImageElement | null;
const reloadButton = document.getElementById("reload-app");
const openExternalButton = document.getElementById("open-external");
const shellStatus = document.getElementById("shell-status");
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
let remoteApp: HTMLElement | undefined;
let loadTimeout: number | undefined;

document.title = APP_CONFIG.title;
document.documentElement.style.setProperty("--appbun-accent", APP_CONFIG.themeColor);
document.documentElement.dataset.platform = isMac ? "mac" : "other";
if (!isMac) {
  document.documentElement.style.setProperty("--shell-topbar-display", "none");
  document.documentElement.style.setProperty("--shell-toolbar-height", "0px");
}
siteName && (siteName.textContent = APP_CONFIG.name);
siteOrigin && (siteOrigin.textContent = APP_CONFIG.origin.replace(/^https?:\/\//, ""));

if (mount) {
  remoteApp = document.createElement("electrobun-webview");
  remoteApp.setAttribute("src", APP_CONFIG.url);
  remoteApp.setAttribute("id", "remote-app");
  remoteApp.classList.add("remote-app");
  showStatus("loading", `Loading ${APP_CONFIG.name}`, APP_CONFIG.origin.replace(/^https?:\/\//, ""));
  loadTimeout = window.setTimeout(() => {
    showStatus("loading", `${APP_CONFIG.name} is still loading`, "Check your network or reload the app.");
  }, 12000);
  remoteApp.addEventListener("dom-ready", () => hideStatus());
  remoteApp.addEventListener("load", () => hideStatus());
  remoteApp.addEventListener("error", (event) => {
    console.error("appbun webview failed to load", event);
    showStatus("error", `${APP_CONFIG.name} could not load`, APP_CONFIG.url);
  });
  mount.appendChild(remoteApp);
} else {
  console.error("appbun shell could not find #webview-mount");
  showStatus("error", "App shell could not start", "Missing #webview-mount");
}

reloadButton?.addEventListener("click", () => {
  const currentSrc = remoteApp?.getAttribute("src") ?? APP_CONFIG.url;
  showStatus("loading", `Reloading ${APP_CONFIG.name}`, APP_CONFIG.origin.replace(/^https?:\/\//, ""));
  remoteApp?.setAttribute("src", "about:blank");
  window.setTimeout(() => remoteApp?.setAttribute("src", currentSrc), 0);
});

openExternalButton?.addEventListener("click", () => {
  window.open(APP_CONFIG.url, "_blank", "noopener,noreferrer");
});

if (!APP_CONFIG.hasIcon && siteIcon) {
  console.warn("appbun shell did not receive a usable icon asset");
  siteIcon.remove();
}

siteIcon?.addEventListener("error", () => {
  console.warn("appbun shell icon failed to load", APP_CONFIG.iconSource);
  siteIcon.remove();
});

console.log("Loading http://127.0.0.1:4123/ with icon appbun:fallback-icon");

function showStatus(kind: "loading" | "error", title: string, detail: string) {
  if (!shellStatus) {
    return;
  }

  const titleElement = shellStatus.querySelector("strong");
  const detailElement = shellStatus.querySelector("span");
  titleElement && (titleElement.textContent = title);
  detailElement && (detailElement.textContent = detail);
  shellStatus.classList.toggle("is-error", kind === "error");
  shellStatus.classList.remove("is-hidden");
}

function hideStatus() {
  if (loadTimeout) {
    window.clearTimeout(loadTimeout);
    loadTimeout = undefined;
  }
  shellStatus?.classList.add("is-hidden");
}
