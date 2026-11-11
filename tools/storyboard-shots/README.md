# Storyboard shots and the navigation test

Two checks on the real OwnStudio window, written in plan step U2. Every later
commit that changes the window runs both (docs/plan.md, "Commit plan for slice 1").

Both start this checkout's built app with a throwaway profile under
`/data/ownstudio/build/shots-<port>`, then stop exactly that app afterwards.

```sh
# from the repository root, after `npm run build` in app/
tools/storyboard-shots/run.sh 9482 /data/ownstudio/build/mission-demo tools/storyboard-shots/navigation-test.mjs control.cpp 500
tools/storyboard-shots/run.sh 9484 /data/ownstudio/build/mission-demo tools/storyboard-shots/shots.mjs
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
  reason. Each commit that builds a frame adds it to `FRAMES`.
- **`cdp.mjs`**: the small DevTools Protocol client both scripts use, and `STATE`,
  the window state read from the page.
