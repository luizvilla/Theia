# Storyboard frames as images

For the slice report, which puts each storyboard frame beside the app's screenshot.

```sh
# from the repository root, after `npm install` in app/ (it uses the app's Electron)
env -u ELECTRON_RUN_AS_NODE app/node_modules/electron/dist/electron tools/storyboard-frames/main.cjs --no-sandbox
python3 tools/storyboard-frames/report-table.py    # the side-by-side table, in Markdown
```

- **`main.cjs`** opens `docs/design/storyboards.html` in a window, then saves each
  frame's window drawing as `docs/images/step-5/storyboard/frame-NN-<id>.png`.
- **`report-table.py`** pairs those with the app's screenshots and the differences
  recorded in `docs/images/step-5/shots.json` (written by `tools/storyboard-shots/shots.mjs`).
