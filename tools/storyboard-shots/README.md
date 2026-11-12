# Storyboard shots and the navigation test

Checks on the real OwnStudio window, begun in plan step U2. Every later
commit that changes the window runs both (docs/plan.md, "Commit plan for slice 1").

They start this checkout's built app with a throwaway profile under
`/data/ownstudio/build/shots-<port>`, then stop exactly that app afterwards.

```sh
# from the repository root, after `npm run build` in app/
# a setup to drive (U5's command line), from a Core clone or mirror
python -m ownstudio_lab.setups mirror <Core clone or URL> /data/ownstudio/build/nav-home/.cache/core.git
python -m ownstudio_lab.setups create /data/ownstudio/build/nav-home/.cache/core.git /data/ownstudio/build/nav-home/setups/twist-buck twist twist-buck
S=/data/ownstudio/build/nav-home/setups/twist-buck
export OWNSTUDIO_HOME=/data/ownstudio/build/nav-home OWNSTUDIO_EXAMPLES=~/code/examples
tools/storyboard-shots/run.sh 9482 $S tools/storyboard-shots/navigation-test.mjs src/main.cpp 500
tools/storyboard-shots/run.sh 9484 $S tools/storyboard-shots/shots.mjs     # frames on a setup
tools/storyboard-shots/run.sh 9486 -  tools/storyboard-shots/shots.mjs     # frames without a folder (Start)
tools/storyboard-shots/run.sh 9485 $S tools/storyboard-shots/menus-test.mjs
OWNSTUDIO_STORYBOARD_BOARD=1 EXPECT_READY=0 \
  tools/storyboard-shots/run.sh 9487 $S tools/storyboard-shots/checklist-test.mjs
OWNSTUDIO_STORYBOARD_BOARD=1 OWNSTUDIO_STORYBOARD_HIGH=29.9 \
  tools/storyboard-shots/run.sh 9488 $S tools/storyboard-shots/capture-test.mjs
OWNSTUDIO_PYTHON=$PWD/app/python/.venv/bin/python \
  tools/storyboard-shots/run.sh 9489 $S tools/storyboard-shots/pulsimgui-sync-test.mjs $S
tools/storyboard-shots/run.sh 9490 $S tools/storyboard-shots/design-test.mjs $S   # needs src/control.cpp and a wired canvas
```

- **`navigation-test.mjs`**: clicks through every workbench × right-bar tab ×
  bottom tab, forward and back, then 500 random clicks (seeded). After each click
  it compares the window with a model of what it should show: the workbench, the
  panel on each side (clicking an open panel's tab closes it, as in Theia), the
  bottom tab, the document in the centre and its scroll position, and the canvas
  tint. It times each switch from the press to the first frame that shows the
  expected state. It passes when no state is wrong, 95 % of switches take 200 ms
  or less, and none takes more than 300 ms. Set `NAV_DETAIL=1` for times per target.
- **`shots.mjs`**: puts the window into the state of each storyboard frame built
  so far and saves `docs/images/step-5/frame-NN-<id>.png`, plus `shots.json`
  with the window state and the known differences from the frame, each with its
  reason. Each commit that builds a frame adds it to `FRAMES`. Frame 7 uses the
  deterministic `fake-pio.mjs` and `fake-flash.mjs`; override `OWNSTUDIO_PIO`
  and `OWNSTUDIO_BUILD_PYTHON` to drive installed tools instead.
- **`menus-test.mjs`** (U3): opens each menu of the menu bar and compares it,
  item by item and separator by separator, with `common/menu-map.ts`.
- **`checklist-test.mjs`** (U11): checks the six live rows, status count and
  board Run button against the deterministic storyboard board. Set
  `OWNSTUDIO_STORYBOARD_PRODUCT`, `OWNSTUDIO_STORYBOARD_HIGH` and
  `EXPECT_READY` to exercise the wrong-board, mismatch and all-green states.
- **`capture-test.mjs`** (U12): runs the board-supplied reference-step capture
  on the deterministic fake Twist, checks its record and HTML report on disk,
  then checks uPlot's event viewport, channels, whole-run control and metrics.
- **`pulsimgui-sync-test.mjs`** (U14): saves a changed named `Rload` value in
  the setup's `.pulsim` project, then checks that the running app's watcher
  persists 27.5 Ω to `setup.yaml` and redraws the already-open canvas.
- **`design-test.mjs`** (U16): drags L on the output filter sheet and times the
  ripple update (limit 0.5 s), then checks that the release puts L on the Twist,
  in `setup.yaml` and in a `design` commit; on the control loop sheet, trying Kp
  must not write `control.cpp`, and Apply must change only the Kp line, add a
  `design` commit and leave the setup clean.
- **`plugins-test.mjs`** (U1, run since U17a): a `.cpp` opens as C++ and is coloured,
  a `.py` as Python, and the git extension shows the branch: the bundled VS Code
  extensions start.
- **`agents-test.mjs`** (U17): types "@" in the AI tab and checks that Claude Code
  and Codex are offered and the old OwnStudio agent is not, that Codex's sandbox
  menu has no Full Access, and that the setup carries AGENTS.md with the power rule.
- **`cdp.mjs`**: the small DevTools Protocol client both scripts use, and `STATE`,
  the window state read from the page.
