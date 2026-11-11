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
import sys
import os
import re
import subprocess
from dataclasses import dataclass

import yaml

EVENT_TRAILER = "OwnStudio-Event"
SETUP_FILE = "ownstudio/setup.yaml"
RESTORED_FROM = "ownstudio-restored-from"      # in .git: the branch a restore left
EVENTS = ("create", "example", "canvas", "code", "build", "flash", "run", "simulate", "milestone", "save", "restore")


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

def create_setup(mirror, dest, board, name=None, ref=None, upstream=None):
    """Clones Core from the mirror into ``dest`` and commits ``ownstudio/setup.yaml``."""
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
    with open(os.path.join(dest, SETUP_FILE), "w", encoding="utf-8") as f:
        yaml.safe_dump(setup, f, sort_keys=False)
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


def all_commits(repo):
    """Every commit reachable from any branch, tag or HEAD (the restore tests check none is lost)."""
    return set(git(repo, "rev-list", "--all", "HEAD").split())


# --- command line, for the app ---------------------------------------------------

def main(argv):
    """python -m ownstudio_lab.setups <command> ... ; prints JSON.

    mirror <upstream> <mirror>
    create <mirror> <dest> <board> [name]
    event <setup> <event> <summary>
    timeline <setup> [ref]
    restore <setup> <commit>
    back <setup>
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
            out = {"setup": create_setup(args[0], args[1], args[2], *args[3:4])}
        elif cmd == "event":
            out = asdict(commit_event(args[0], args[1], args[2]))
        elif cmd == "timeline":
            out = [asdict(d) for d in timeline(*args)]
        elif cmd == "restore":
            restore(args[0], args[1])
            out = {"restored": args[1]}
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
