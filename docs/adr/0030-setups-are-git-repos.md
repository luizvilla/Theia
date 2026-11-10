# Setups are git repositories, shown as a timeline, with libraries as submodules

Each setup is a git repository in the user's `~/OwnStudio/` folder (like Arduino's sketchbook). Its history is shown as a **timeline** strip under the canvas, as Fusion 360 shows its history: OwnStudio commits automatically at meaningful moments (example loaded, build, flash, run, simulation, setup change), the user can add named milestones, a click on a dot previews that state, "Restore here" returns to it, and editing from an old dot starts a branch. Branches are supported from the start; lanes in the interface come later.

Libraries are git **submodules** in the setup's `libs/` folder, managed by OwnStudio, so every timeline dot also pins the library commits. A library may have several remotes (upstream, the user's fork, colleagues' forks); OwnStudio fetches them, shows their branches, cherry-picks, imports a clone already on disk as one more remote, and proposes changes upstream as a fork and pull request. New local libraries start from a template. Libraries are chosen in a checkbox dialog (Setup → Libraries), and `lib_deps` is kept in step so the VS Code build still works.

Loading an example copies its files into the setup on a new branch named after it, with its origin (repository and commit) recorded; the previous work stays on its branch. The `old/` folder of the PlatformIO flow is not used.

Records stay out of git (they are large and reproducible from the commit); reports, light HTML pages with plots, conditions and commit, are committed under `reports/` for sharing.

## Merge rules

To avoid half-finished merges that block everything:
1. The tree is always clean before any git operation (auto-commits).
2. Pull only fast-forwards; diverged incoming work lands on its own branch.
3. A merge is tried in a separate worktree; if it conflicts, the setup is untouched and the conflicts open in a three-way merge editor; Abort always works.
4. Library conflicts are a choice between two commits, never text; `setup.yaml` is merged key by key.

## Sign-in and pushing

Users sign in to GitHub or GitLab in the browser, as `gh` and VS Code do; the token pushes over HTTPS and creates forks and pull requests. "Use SSH instead" generates a key and uploads it through the API. Existing keys and git settings are used as they are. Before pushing, OwnStudio checks that every pinned library commit is on a remote, and proposes pushing it to the user's fork when it is not.

## Considered options

- **Hidden checkpoints per mission step** (SPEC 1.0 Q63): replaced by a visible timeline.
- **A lock file for libraries**: submodules record the same commits in the history itself.
- **Libraries fetched by PlatformIO only** (today): no local edits, no forks, no reproducibility across machines.

## Consequences

- VS Code's git extension and GitHub's pull-request extension come through Theia's plugin system, which OwnStudio needs anyway for language support.
- A user never types a submodule command; OwnStudio owns them.
- Proposed in slice 0, to confirm: the setup repository is a clone of OwnTech Core, since OwnTech projects already are Core checkouts pulled from several cores ([SPEC §12](../../SPEC.md#12-boards-examples-and-libraries)).
