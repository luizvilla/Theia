# SPDX-License-Identifier: LGPL-2.1
"""Setups: clones of OwnTech Core with an ``ownstudio/`` folder, committed at events.

ADR 0030. A setup is a git repository: a clone of Core (so PlatformIO builds it
as Core builds), plus ``ownstudio/setup.yaml`` for the canvas. OwnStudio commits
at events (canvas change, build, flash, run...) and the timeline is the list of
those commits (choice S5: the event is a commit trailer, ``OwnStudio-Event:``;
any other git tool sees ordinary commits).

New setups are cloned from a local mirror of Core (choice S4), so creating one
works offline and takes seconds.

Restoring never destroys (choice S7): restoring a dot checks it out without a
branch (detached), after committing anything unsaved; a branch is created only
at the first edit made from there. Going back and forth makes no branches.

Plain git through its command line: nothing here needs a git library.
"""
import datetime
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass

import yaml

EVENT_TRAILER = "OwnStudio-Event"
SETUP_FILE = "ownstudio/setup.yaml"
RESTORED_FROM = "ownstudio-restored-from"      # in .git: the branch a restore left
EVENTS = ("create", "example", "canvas", "code", "design", "build", "flash", "run", "simulate", "milestone", "save",
          "restore")


class SetupError(Exception):
    pass


def git(repo, *args, check=True, env=None):
    full_env = dict(os.environ, GIT_TERMINAL_PROMPT="0", **(env or {}))
    out = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, env=full_env)
    if check and out.returncode != 0:
        raise SetupError(f"git {' '.join(args)}: {out.stderr.strip() or out.stdout.strip()}")
    return out.stdout


# --- the Core mirror (S4) ---------------------------------------------------

def update_mirror(upstream, mirror):
    """Keeps a bare mirror of Core at ``mirror``; fetches when it exists. Offline, the old mirror serves."""
    if os.path.isdir(os.path.join(mirror, "refs")):
        out = subprocess.run(["git", "-C", mirror, "remote", "update", "--prune"], capture_output=True, text=True,
                             env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
        return out.returncode == 0
    os.makedirs(os.path.dirname(mirror) or ".", exist_ok=True)
    out = subprocess.run(["git", "clone", "--mirror", "--quiet", upstream, mirror], capture_output=True, text=True,
                         env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
    if out.returncode != 0:
        raise SetupError(f"cannot mirror {upstream}: {out.stderr.strip()}")
    return True


# --- creating a setup ---------------------------------------------------------

def _copy_board_plant(dest, board_root, board):
    """Copy the plant artifacts declared by a board into the new setup."""
    if not board_root:
        return None
    description = os.path.join(board_root, board, "board.yaml")
    if not os.path.isfile(description):
        raise SetupError(f"no board description for {board}: {description}")
    with open(description, encoding="utf-8") as f:
        plant = (yaml.safe_load(f) or {}).get("plant")
    if plant is None:
        return None
    if isinstance(plant, str):
        plant = {"file": plant}
    if not isinstance(plant, dict) or not plant.get("file"):
        raise SetupError(f"the {board} board's plant declaration needs a file")
    installed = dict(plant)
    target_dir = os.path.join(dest, "ownstudio", "plant")
    os.makedirs(target_dir, exist_ok=True)
    for field in ("file", "wrapper"):
        relative = plant.get(field)
        if not relative:
            continue
        source = os.path.join(board_root, board, relative)
        if not os.path.isfile(source):
            raise SetupError(f"the {board} board's {field} is missing: {source}")
        target = os.path.join(target_dir, os.path.basename(relative))
        shutil.copy2(source, target)
        installed[field] = os.path.relpath(target, dest).replace(os.sep, "/")
    include_dirs = []
    for relative in plant.get("host_include_dirs", []):
        source = os.path.join(board_root, board, relative)
        if not os.path.isdir(source):
            raise SetupError(f"the {board} board's host include directory is missing: {source}")
        target = os.path.join(target_dir, os.path.basename(relative.rstrip("/")))
        shutil.copytree(source, target, dirs_exist_ok=True)
        include_dirs.append(os.path.relpath(target, dest).replace(os.sep, "/"))
    if include_dirs:
        installed["host_include_dirs"] = include_dirs
    return installed


def _copy_board_design(dest, board_root, board, description):
    """Install a board's readable design sheets beside the setup metadata."""
    design = description.get("design")
    if design is None:
        return None
    if isinstance(design, str):
        design = {"directory": design}
    if not isinstance(design, dict) or not design.get("directory"):
        raise SetupError(f"the {board} board's design declaration needs a directory")
    relative = str(design["directory"])
    source = os.path.join(board_root, board, relative)
    if not os.path.isdir(source):
        raise SetupError(f"the {board} board's design directory is missing: {source}")
    target = os.path.join(dest, "ownstudio", "design")
    shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    installed = dict(design)
    installed["directory"] = os.path.relpath(target, dest).replace(os.sep, "/")
    return installed


def _board_description(board_root, board):
    path = os.path.join(board_root, board, "board.yaml")
    if not os.path.isfile(path):
        raise SetupError(f"no board description for {board}: {path}")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def design_sheets(repo, board_root=None):
    """The setup's design sheets, installed from its board first if a setup predates them (plan U16).

    Returns ``{"directory", "sheets": [{id, label}], "installed": bool}``. Installing
    writes ``ownstudio/design/`` and the ``design`` entry of setup.yaml and commits
    a ``design`` event, so the sheets are part of the setup from then on.
    """
    path = os.path.join(repo, SETUP_FILE)
    with open(path, encoding="utf-8") as f:
        setup = yaml.safe_load(f) or {}
    design = setup.get("design")
    installed = False
    if not (isinstance(design, dict) and os.path.isdir(os.path.join(repo, str(design.get("directory", ""))))):
        if not board_root:
            raise SetupError("this setup has no design sheets and no board folder to take them from")
        board = setup.get("board")
        design = _copy_board_design(repo, board_root, board, _board_description(board_root, board))
        if design is None:
            raise SetupError(f"the {board} board has no design sheets")
        setup["design"] = design
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(setup, f, sort_keys=False)
        commit_event(repo, "design", "design: the board's design sheets added")
        installed = True
    return {"directory": design["directory"], "sheets": list(design.get("sheets") or []), "installed": installed}


def create_setup(mirror, dest, board, name=None, ref=None, upstream=None, board_root=None):
    """Clone Core, copy the board plant, and commit ``ownstudio/setup.yaml``."""
    if os.path.exists(dest) and os.listdir(dest):
        raise SetupError(f"{dest} exists and is not empty")
    args = ["clone", "--quiet"] + (["--branch", ref] if ref else []) + [mirror, dest]
    out = subprocess.run(["git", *args], capture_output=True, text=True, env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
    if out.returncode != 0:
        raise SetupError(f"cannot clone Core: {out.stderr.strip()}")
    # The clone's origin is the local mirror; Core's own URL is kept as "core" when known.
    if upstream:
        git(dest, "remote", "add", "core", upstream)
    branch = slug(name or os.path.basename(os.path.abspath(dest)))
    git(dest, "checkout", "--quiet", "-b", branch)
    setup = {
        "name": name or os.path.basename(os.path.abspath(dest)),
        "board": board,
        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "core": git(dest, "rev-parse", "HEAD").strip(),
        "canvas": {"nodes": [{"id": "board", "part": board}], "wires": []},
    }
    os.makedirs(os.path.join(dest, "ownstudio"), exist_ok=True)
    description = _board_description(board_root, board) if board_root else {}
    plant = _copy_board_plant(dest, board_root, board)
    if plant:
        setup["plant"] = plant
    design = _copy_board_design(dest, board_root, board, description) if board_root else None
    if design:
        setup["design"] = design
    with open(os.path.join(dest, SETUP_FILE), "w", encoding="utf-8") as f:
        yaml.safe_dump(setup, f, sort_keys=False)
    ignore = os.path.join(dest, ".gitignore")
    if os.path.isfile(ignore):
        with open(ignore, encoding="utf-8") as f:
            text = f.read()
    else:
        text = ""
    if "ownstudio/records/" not in text.splitlines():
        with open(ignore, "a", encoding="utf-8") as f:
            f.write(("" if not text or text.endswith("\n") else "\n") + "ownstudio/records/\n")
    commit_event(dest, "create", f"setup: {setup['name']} on the {board}")
    return dest


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "setup"


# --- events and the timeline (S5) ------------------------------------------------

@dataclass
class Dot:
    commit: str
    event: str
    summary: str
    date: str
    branch: str | None = None


def _identity_env(repo):
    """Commits need an author: the user's own git identity, or OwnStudio's when none is set."""
    env = {}
    if not git(repo, "config", "user.name", check=False).strip():
        env.update(GIT_AUTHOR_NAME="OwnStudio", GIT_COMMITTER_NAME="OwnStudio")
    if not git(repo, "config", "user.email", check=False).strip():
        env.update(GIT_AUTHOR_EMAIL="ownstudio@localhost", GIT_COMMITTER_EMAIL="ownstudio@localhost")
    return env


def current_branch(repo):
    name = git(repo, "symbolic-ref", "--quiet", "--short", "HEAD", check=False).strip()
    return name or None


def is_dirty(repo):
    return bool(git(repo, "status", "--porcelain").strip())


def commit_event(repo, event, summary, extra_trailers=None):
    """Commits the setup's state as one timeline dot. Events without file changes (a build, a run) are empty commits.

    After a restore (detached HEAD), the first edit creates a branch from the restored dot (S7).
    """
    if event not in EVENTS:
        raise SetupError(f"unknown event {event!r}")
    branch_made = None
    if current_branch(repo) is None:
        branch_made = _branch_from_restore(repo)
    git(repo, "add", "--all")
    trailers = [f"{EVENT_TRAILER}: {event}"] + [f"{k}: {v}" for k, v in (extra_trailers or {}).items()]
    message = summary + "\n\n" + "\n".join(trailers) + "\n"
    git(repo, "commit", "--quiet", "--allow-empty", "--no-verify", "-m", message, env=_identity_env(repo))
    return Dot(commit=git(repo, "rev-parse", "HEAD").strip(), event=event, summary=summary,
               date=git(repo, "log", "-1", "--format=%cI").strip(), branch=branch_made or current_branch(repo))


def timeline(repo, ref="HEAD", limit=None):
    """The dots of ``ref``'s history, oldest first: commits that carry an OwnStudio event."""
    sep, end = "\x1f", "\x1e"
    fmt = sep.join(["%H", "%s", f"%(trailers:key={EVENT_TRAILER},valueonly,separator=%x2C)", "%cI"]) + end
    args = ["log", f"--format={fmt}", ref] + ([f"-n{limit}"] if limit else [])
    dots = []
    for entry in git(repo, *args).split(end):
        entry = entry.strip("\n")
        if not entry:
            continue
        commit, summary, event, date = entry.split(sep)
        if event.strip():
            dots.append(Dot(commit=commit, event=event.strip(), summary=summary, date=date))
    return list(reversed(dots))


# --- restore (S7) ----------------------------------------------------------------

def restore(repo, commit):
    """Shows the setup as it was at ``commit``. Unsaved work is committed first; no branch is made."""
    if is_dirty(repo):
        commit_event(repo, "save", "unsaved work, kept before a restore")
    elif current_branch(repo) is None and not git(repo, "for-each-ref", "--contains", "HEAD", "refs/heads").strip():
        # Commits made by hand on a restored dot (outside OwnStudio) get a branch before HEAD moves.
        _branch_from_restore(repo)
    branch = current_branch(repo)
    if branch:
        with open(os.path.join(_git_dir(repo), RESTORED_FROM), "w", encoding="utf-8") as f:
            f.write(branch)
    git(repo, "checkout", "--quiet", "--detach", commit)


def back_to_latest(repo):
    """Leaves a restored dot for the branch the restore left (when nothing was edited there)."""
    branch = _restored_from(repo)
    if branch is None:
        return current_branch(repo)
    if is_dirty(repo):
        commit_event(repo, "save", "unsaved work, kept before returning")
        return current_branch(repo)
    git(repo, "checkout", "--quiet", branch)
    os.unlink(os.path.join(_git_dir(repo), RESTORED_FROM))
    return branch


def _git_dir(repo):
    path = git(repo, "rev-parse", "--git-dir").strip()
    return path if os.path.isabs(path) else os.path.join(repo, path)


def _restored_from(repo):
    try:
        with open(os.path.join(_git_dir(repo), RESTORED_FROM), encoding="utf-8") as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None


def _branch_from_restore(repo):
    """The first edit after a restore: a branch named after the branch left and the restored dot."""
    # A branch made from a branch made after a restore is still named after the first one.
    base = re.sub(r"-from-[0-9a-f]{7,}(-\d+)?$", "", _restored_from(repo) or "setup")
    short = git(repo, "rev-parse", "--short", "HEAD").strip()
    name, n = f"{base}-from-{short}", 1
    while git(repo, "rev-parse", "--verify", "--quiet", f"refs/heads/{name}", check=False).strip():
        n += 1
        name = f"{base}-from-{short}-{n}"
    git(repo, "checkout", "--quiet", "-b", name)
    try:
        os.unlink(os.path.join(_git_dir(repo), RESTORED_FROM))
    except FileNotFoundError:
        pass
    return name


# --- examples (plan U7, storyboard frame 5) -----------------------------------------

ORIGIN_FILE = "ownstudio/origin.yaml"
# What an example folder holds besides its firmware: not copied into src/.
EXAMPLE_SKIP = {"README.md", "Image", "images", "mission", "ownstudio", ".git"}


def load_example(repo, examples_root, example):
    """Loads an example into the setup on a new branch named after it.

    Unsaved work is committed first on the branch it was made on, so the previous
    firmware stays there (nothing goes to an old/ folder). The example's files
    replace ``src/``; its OwnStudio extras (an ``ownstudio/`` folder) join the
    setup's; ``ownstudio/origin.yaml`` records where it came from.
    """
    source = os.path.join(examples_root, example)
    if not os.path.isfile(os.path.join(source, "main.cpp")):
        raise SetupError(f"{example} is not an example (no main.cpp)")
    if is_dirty(repo):
        commit_event(repo, "save", "unsaved work, kept before loading an example")
    previous = current_branch(repo)
    if previous is None:
        previous = _branch_from_restore(repo)
    name, n = slug(os.path.basename(example.rstrip("/"))), 1
    branch = name
    while git(repo, "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}", check=False).strip():
        n += 1
        branch = f"{name}-{n}"
    git(repo, "checkout", "--quiet", "-b", branch)

    src = os.path.join(repo, "src")
    tracked = [p for p in git(repo, "ls-files", "-z", "src").split("\0") if p]
    if tracked:
        git(repo, "rm", "--quiet", "-r", "--", *tracked)
    os.makedirs(src, exist_ok=True)
    copied = []
    for entry in sorted(os.listdir(source)):
        if entry in EXAMPLE_SKIP:
            continue
        path = os.path.join(source, entry)
        if os.path.isdir(path):
            shutil.copytree(path, os.path.join(src, entry), dirs_exist_ok=True)
        else:
            shutil.copy2(path, os.path.join(src, entry))
        copied.append(entry)
    extras = os.path.join(source, "ownstudio")
    if os.path.isdir(extras):
        shutil.copytree(extras, os.path.join(repo, "ownstudio"), dirs_exist_ok=True)

    examples_commit = git(examples_root, "rev-parse", "HEAD", check=False).strip() or None
    origin = {
        "example": example.replace(os.sep, "/"),
        "repository": git(examples_root, "remote", "get-url", "origin", check=False).strip() or examples_root,
        "commit": examples_commit,
        "loaded": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "files": copied,
        "extras": os.path.isdir(extras),
        "previous_branch": previous,
    }
    with open(os.path.join(repo, ORIGIN_FILE), "w", encoding="utf-8") as f:
        yaml.safe_dump(origin, f, sort_keys=False)
    dot = commit_event(repo, "example", f"example: {os.path.basename(example.rstrip('/'))}",
                       {"OwnStudio-Example": origin["example"]})
    return {"branch": branch, "previous_branch": previous, "commit": dot.commit, "files": copied, "extras": origin["extras"]}


def all_commits(repo):
    """Every commit reachable from any branch, tag or HEAD (the restore tests check none is lost)."""
    return set(git(repo, "rev-list", "--all", "HEAD").split())


# --- command line, for the app ---------------------------------------------------

def main(argv):
    """python -m ownstudio_lab.setups <command> ... ; prints JSON.

    mirror <upstream> <mirror>
    create <mirror> <dest> <board> [name] [boards root]
    event <setup> <event> <summary>
    timeline <setup> [ref]
    restore <setup> <commit>
    back <setup>
    example <setup> <examples root> <example path>
    design <setup> [boards root]
    """
    import json
    from dataclasses import asdict
    if len(argv) < 2:
        print(main.__doc__, file=sys.stderr)
        return 2
    cmd, args = argv[1], argv[2:]
    try:
        if cmd == "mirror":
            out = {"updated": update_mirror(*args)}
        elif cmd == "create":
            out = {"setup": create_setup(args[0], args[1], args[2],
                                          name=args[3] if len(args) > 3 else None,
                                          board_root=args[4] if len(args) > 4 else None)}
        elif cmd == "event":
            out = asdict(commit_event(args[0], args[1], args[2]))
        elif cmd == "timeline":
            out = [asdict(d) for d in timeline(*args)]
        elif cmd == "restore":
            restore(args[0], args[1])
            out = {"restored": args[1]}
        elif cmd == "example":
            out = load_example(args[0], args[1], args[2])
        elif cmd == "design":
            out = design_sheets(args[0], args[1] if len(args) > 1 else None)
        elif cmd == "back":
            out = {"branch": back_to_latest(args[0])}
        else:
            print(main.__doc__, file=sys.stderr)
            return 2
    except (SetupError, IndexError, TypeError) as e:
        json.dump({"error": str(e)}, sys.stdout)
        print()
        return 1
    json.dump(out, sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
