# Dev map tooling

Redraws the [dev map](https://github.com/luizvilla/Theia/issues/17) from the tracker alone ([#18](https://github.com/luizvilla/Theia/issues/18)).

```sh
python3 tools/devmap/devmap.py --dry-run   # what would change
python3 tools/devmap/devmap.py             # write it; then commit docs/overview.md
```

Run it after any ticket opens, closes, is claimed or is blocked; running it twice changes nothing.

- **Colours** come from each map ticket: closed is done (green); claimed (assigned) is in progress (purple), or stale (red, ⏳) after `stale_days` (3) without a comment, a commit or an update; with an open blocker it is blocked (orange); otherwise takeable (blue).
- **Solid arrows** are GitHub's own blocking links between map tickets, without the ones a longer path already shows. Record a dependency as a blocking link, not in the drawing.
- **[layout.toml](layout.toml)** holds what the tracker can't: groups and their order, short node labels, fog nodes, work done before the map, dotted arrows and the way to the destination. A ticket it doesn't place shows under "New tickets" until it gets a place there. A group with `collapse_when_done` becomes a single node once all of its tickets are closed.
- **Resume here** lists the claimed tickets, each with its last comment and its last commit. A commit counts for a ticket through a `Refs #n` / `Closes #n` line, or `(#n)` in its subject.
- **The Project** "OwnStudio dev map" gets every map ticket, with Status (Todo, In Progress, Blocked, Done), Slice (from the ticket's group) and Kind (Build, Task, else Decision).

Tests: `python3 -m unittest discover -s tools/devmap/tests` runs on a recorded snapshot. Refresh the snapshot with `python3 tools/devmap/devmap.py snapshot > tools/devmap/tests/snapshot.json`; the tests then need to match the new map.
