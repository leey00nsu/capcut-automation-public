# CapCut Automation Desktop

Generated with [appbun](https://github.com/bigmacfive/appbun) and customized for this repository. This Electrobun project starts the local Next.js standalone server on `http://127.0.0.1:4123/` and loads it inside a macOS desktop window.

This app is intended for local macOS use. It is not configured for App Store sandboxing.

## Prerequisites

- macOS
- The bundled Electrobun Bun runtime starts the packaged server; local development can override it with Node or Bun if needed
- Project runtime tools used by the web app when those features are selected: `ffmpeg`, `ffprobe`, `whisper-cli`, `uv`, `sqlite3`, and `osascript`
- Any local STT model paths or API keys the web app already expects

## Run Locally

From the repository root:

```bash
npm run desktop:install
npm run desktop:dev
```

`desktop:dev` builds the Next standalone output, points the wrapper at `.next/standalone`, starts the standalone server, then opens the Electrobun shell.

## Build A DMG

From the repository root:

```bash
npm run desktop:install
npm run desktop:dmg
```

The default DMG is unsigned and works well for local testing, personal use, and internal review. On macOS, the DMG wraps the newest `.app` bundle under `desktop/capcut-automation-desktop/build/`.

During packaging, `scripts/prepare-expanded-app.mjs` expands the Electrobun self-extracting wrapper into a normal `.app`, then copies these repository assets into that expanded app bundle:

- `.next/standalone`
- `.next/static`
- `public`
- `templates`
- `scripts/local-stt`

The final DMG uses `build/expanded-macos-arm64/CapCut Automation.app`, not the smaller self-extracting wrapper. This avoids Electrobun's self-extractor limits with the deep file tree produced by Next standalone builds.

## Sign A DMG

Set `APPLE_SIGN_IDENTITY` to a local Developer ID Application identity before running the DMG script:

```bash
APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" npm run build:dmg
```

To require signing and fail when no identity is configured:

```bash
APPBUN_DMG_SIGN=1 APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" npm run build:dmg
```

This signs the `.app` before creating the DMG. Notarization is not configured by default.

## Notarize A DMG

For public macOS distribution, provide Apple notarization credentials and run:

```bash
APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
APPLE_ID="you@example.com" \
APPLE_TEAM_ID="TEAMID" \
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
npm run build:dmg:notarized
```

This signs the `.app`, creates the DMG, submits it with `xcrun notarytool`, and staples the notarization ticket to the DMG.

## CI Builds

Electrobun builds should run on a native runner for the target platform. Use the same project on each OS instead of treating local builds as cross-compilation.

- macOS runner or machine: `npm run build:macos`
- macOS DMG installer: `npm run build:dmg`
- Windows runner or machine: `npm run build:windows`
- Linux runner or machine: `npm run build:linux`

`npm run build:all` is intentionally a reminder for CI matrix builds. It does not cross-compile locally; run `build:stable` on native macOS, Windows, and Linux runners to produce release artifacts.

This project includes `.github/workflows/release.yml`. Add `APPLE_SIGN_IDENTITY` as a repository secret if the macOS CI runner should sign before packaging.

## Configuration

- App name: `CapCut Automation`
- Identifier: `com.local.capcutautomation`
- Source URL: [http://127.0.0.1:4123/](http://127.0.0.1:4123/)
- Theme color: `#24bc31`
- Titlebar preset: `unified`
- Window size: `1440x900`
- Icon source: [appbun:fallback-icon](appbun:fallback-icon)
- Generated manifest: `appbun.generated.json`

## Runtime Overrides

- `CAPCUT_AUTOMATION_STANDALONE_DIR`: absolute path to a prepared Next standalone directory containing `server.js`
- `CAPCUT_AUTOMATION_SERVER_RUNTIME`: executable used to run `server.js`; defaults to the Bun executable running the Electrobun main process

## Files

- `appbun.generated.json`: source URL, generator version, icon source, shell settings, and package manager
- `src/bun/index.ts`: starts the standalone Next server, creates the Electrobun window, and loads the local shell
- `src/mainview/`: the shell toolbar, controls, and embedded webview
- `scripts/prepare-expanded-app.mjs`: expands the Electrobun wrapper and copies the web app standalone runtime into the macOS `.app` bundle
- `scripts/copy-next-standalone.ts`: helper retained for direct Electrobun hook experiments; the default root scripts use `prepare-expanded-app.mjs`
- `scripts/create-dmg.mjs`: creates unsigned DMGs by default and signs the app when `APPLE_SIGN_IDENTITY` is set
- `.github/workflows/release.yml`: builds release artifacts on macOS, Windows, and Linux GitHub-hosted runners

## Common Failures

- No `.app` under `build/`: run `npm run build` or `npm run build:stable` before `npm run build:dmg`.
- `next-standalone/server.js` not found: run `npm run desktop:prepare` from the repository root.
- Server runtime startup fails: launch with `CAPCUT_AUTOMATION_SERVER_RUNTIME=node` if the standalone server works under your local Node version, or rebuild after installing/updating desktop dependencies.
- Port `4123` is already in use: stop the other process and reopen the app.
- `APPLE_SIGN_IDENTITY` not found: run `security find-identity -v -p codesigning` and use one of the listed identity names.
- Keychain permission denied: unlock the keychain or allow `codesign` to use the certificate.
- Notarization failed: confirm `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`, then rerun on a macOS machine with Xcode tools.
- `create-dmg` or `hdiutil` failed: rerun `npm install`, confirm you are on macOS, and inspect the command output above the error.

## Notes

The generated app loads the remote site inside an Electrobun shell. The selected `unified` preset maps to a hidden inset macOS toolbar with a connected local header and standard native chrome on other platforms.

If the installed macOS app does not open from Finder or the Dock the first time, open it once from the Applications folder with **Open** in the context menu. Some local Electrobun builds trigger a one-time launcher permission prompt on first launch.
