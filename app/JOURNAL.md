# OwnStudio app: build journal

Problems met while building the app, and how they were solved. Add an entry whenever a build step needs a non-obvious fix. Started from the journal of the abandoned Theia spike in the modular repository (`theia/IMPLEMENTATION_JOURNAL.md`, branch `owntech_extension_overhaul`).

## Versions

- Theia **1.76.0** (2026-09-24). 1.77.0 was two days old when step 1 started, so it was skipped.
- Electron **42.8.1**, the exact version `@theia/electron` 1.76.0 requires as a peer. Upgrade Electron only together with Theia (modular journal, still true).
- Node 22, npm 10.

## Building

```sh
cd app
npm install
npm run build --workspace=@ownstudio/core
cd applications/electron
npx theia rebuild:electron     # native modules against Electron's ABI
npx theia build --mode development
npm start                      # or: env -u ELECTRON_RUN_AS_NODE npx electron . <folder>
```

## Problems and fixes

### The ripgrep pin from the modular journal now breaks the build

The modular spike pinned `@vscode/ripgrep` to 1.15.14 because Theia 1.71's webpack plugin could not find the binary of 1.18. Theia 1.76 bundles with esbuild and expects the 1.18 layout (`@vscode/ripgrep-linux-x64`). With the old pin, `theia build` fails with `Could not resolve path of module: @vscode/ripgrep-linux-x64`. **Fix:** no override. `@theia/file-search` is a direct dependency, so ripgrep 1.18 is installed.

### Electron's binary may not download during `npm install`

After the first install, `node_modules/electron/dist` was missing. **Fix:** `cd node_modules/electron && node install.js`. Set `electron_config_cache` to keep the download off a full disk.

### Deleting a package by hand leaves npm thinking it is installed

npm keeps a hidden `node_modules/.package-lock.json`. After removing a folder from `node_modules`, `npm install` reported "up to date" and the build failed on a missing `@vscode/codicons`. **Fix:** remove `node_modules` and `package-lock.json` and install again (about 40 s).

### `ELECTRON_RUN_AS_NODE` is set in VS Code and Claude Code terminals

This still applies (modular journal). The `start` script runs `env -u ELECTRON_RUN_AS_NODE theia start`.

### Native modules

`theia rebuild:electron` rebuilds drivelist, keytar and native-keymap. On this Ubuntu 24.04 machine `libxkbfile-dev` was already installed. `libsecret-1-dev` is not, and the rebuild still succeeded. The message `Module not found: find-git-repositories` is harmless: that module comes from the git extension, which OwnStudio does not use.

### Screenshots without a person at the screen

Start Electron with `--remote-debugging-port=<port>`, then use the Chrome DevTools Protocol (`Page.captureScreenshot`) to capture the page. No virtual display (Xvfb) is installed on this machine, so the window opens on the real display.
