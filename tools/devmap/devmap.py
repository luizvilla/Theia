#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-only
"""Dev map tooling (#18): redraw the dev map from the tracker alone.

    python3 tools/devmap/devmap.py             # write the map issue, docs/overview.md, the Project
    python3 tools/devmap/devmap.py --dry-run   # print what would change, write nothing
    python3 tools/devmap/devmap.py snapshot    # print the tracker snapshot (JSON), for test fixtures

It reads the map's sub-issues (state, labels, assignee, blocking links, last comment), the
last commit naming each ticket ("#n" in its message), and the Project's fields, then

- draws the Mermaid diagram (layout from layout.toml) into the map body and docs/overview.md,
  between the devmap:diagram markers;
- writes "Resume here" (tickets in progress, last comment, last commit) between the
  devmap:resume markers of the map body;
- marks a claimed ticket stale (red, ⏳) after stale_days without a comment, commit or update;
- adds every map ticket to the Project and sets Status, Slice and Kind.

Running it twice changes nothing. Needs `gh` logged in, and git.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import pathlib
import re
import subprocess
import sys
import tomllib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LAYOUT = HERE / "layout.toml"
OVERVIEW = ROOT / "docs" / "overview.md"

CLASSDEFS = """  classDef done fill:#d3f9d8,stroke:#2b8a3e,color:#1b4332
  classDef open fill:#d0ebff,stroke:#1c7ed6,color:#0b3d6e
  classDef blocked fill:#ffe8cc,stroke:#e8590c,color:#5c2b00
  classDef wip fill:#f3d9fa,stroke:#ae3ec9,color:#4a1259
  classDef stale fill:#ffe3e3,stroke:#e03131,color:#5c0a0a,stroke-width:3px
  classDef fog fill:#f1f3f5,stroke:#868e96,color:#495057,stroke-dasharray:5 5
  classDef dest fill:#343a40,stroke:#000,color:#fff,font-weight:bold"""
LEGEND = ("<sub>Green done · blue takeable · purple in progress · orange blocked · red ⏳ stale "
          "(3 days without activity) · grey dashed fog · 🔨 build · 🔎 research · 👤 can't move without Luiz.</sub>")
STATUS_OPTION = {"done": "Done", "wip": "In Progress", "stale": "In Progress", "blocked": "Blocked", "open": "Todo"}


# ---------------------------------------------------------------- state of one ticket

def parse_time(s: str | None) -> dt.datetime | None:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def last_activity(t: dict) -> dt.datetime | None:
    times = [parse_time(t.get("updatedAt")), parse_time((t.get("lastComment") or {}).get("createdAt")),
             parse_time((t.get("lastCommit") or {}).get("date"))]
    times = [x for x in times if x]
    return max(times) if times else None


def classify(t: dict, tickets: dict[int, dict], now: dt.datetime, stale_days: int = 3) -> str:
    """done (closed) · wip / stale (claimed) · blocked (an open blocker) · open (takeable)."""
    if t["state"] == "CLOSED":
        return "done"
    if t["assignees"]:
        last = last_activity(t)
        return "stale" if last and now - last > dt.timedelta(days=stale_days) else "wip"
    if any(b["state"] == "OPEN" for b in t["blockedBy"]):
        return "blocked"
    return "open"


def merge_states(states: list[str]) -> str:
    """One node for several tickets: done when all are; otherwise the most urgent."""
    if all(s == "done" for s in states):
        return "done"
    for s in ("stale", "wip", "open", "blocked"):
        if s in states:
            return s
    return "done"


def kind(labels: list[str]) -> str:
    if "wayfinder:build" in labels:
        return "Build"
    if "wayfinder:task" in labels:
        return "Task"
    return "Decision"


# ---------------------------------------------------------------- the diagram

def node_text(node: dict, members: list[dict], state: str) -> str:
    numbers = [t["number"] for t in members]
    ref = f"#{numbers[0]}" if len(numbers) == 1 else f"#{numbers[0]}–#{numbers[-1]}"
    if state == "done":
        icons = "✓ "
    else:
        labels = {name for t in members for name in t["labels"]}
        icons = "".join(i for i, label in (("🔨", "wayfinder:build"), ("🔎", "wayfinder:research"), ("👤", "wayfinder:luiz"))
                        if label in labels)
        icons = ("⏳" if state == "stale" else "") + icons
        icons = icons + " " if icons else ""
    return f"{icons}{ref} {node['label']}"


def default_label(title: str, width: int = 26) -> str:
    words, lines, line = title.split(), [], ""
    for w in words:
        if line and len(line) + 1 + len(w) > width:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    lines.append(line)
    return "<br/>".join(lines[:3])


def layout_nodes(layout: dict, tickets: dict[int, dict]) -> list[dict]:
    """Groups with their nodes; map tickets the layout does not place go to "New tickets"."""
    groups = [dict(g, nodes=[dict(n) for n in g["nodes"]]) for g in layout["group"]]
    placed = {n for g in groups for node in g["nodes"] for n in node.get("tickets", [])}
    new = [{"id": f"N{n}", "tickets": [n], "label": default_label(tickets[n]["title"])}
           for n in sorted(tickets) if n not in placed]
    if new:
        groups.append({"id": "New", "title": "New tickets: place them in tools/devmap/layout.toml", "nodes": new})
    return groups


def render_diagram(snapshot: dict, layout: dict) -> str:
    now = parse_time(snapshot["now"])
    tickets = {t["number"]: t for t in snapshot["tickets"]}
    states = {n: classify(t, tickets, now, layout.get("stale_days", 3)) for n, t in tickets.items()}
    groups = layout_nodes(layout, tickets)

    lines = ["```mermaid", "flowchart LR", CLASSDEFS, "",
             f'  DEST(["{layout["destination"]}"]):::dest', ""]
    node_of: dict[int, str] = {}      # ticket -> node id drawn
    alias: dict[str, str] = {}        # layout node id -> node id drawn (collapsed groups)
    for g in groups:
        nodes = [n for n in g["nodes"] if "tickets" not in n or any(x in tickets for x in n["tickets"])]
        members = [tickets[x] for n in nodes for x in n.get("tickets", []) if x in tickets]
        collapsed = g.get("collapse_when_done") and members and all(states[t["number"]] == "done" for t in members) \
            and not any("fog" in n for n in nodes)
        lines.append(f'  subgraph {g["id"]}["{g["title"]}"]')
        if collapsed:
            lines.append(f'    {g["id"]}_done["✓ {g["title"]}<br/>{len(members)} tickets done"]:::done')
            for n in nodes:
                alias[n["id"]] = f'{g["id"]}_done'
                for x in n.get("tickets", []):
                    node_of[x] = f'{g["id"]}_done'
        else:
            for n in nodes:
                alias[n["id"]] = n["id"]
                if "done" in n:
                    lines.append(f'    {n["id"]}["✓ {n["done"]}"]:::done')
                elif "fog" in n:
                    lines.append(f'    {n["id"]}["{n["fog"]}"]:::fog')
                else:
                    mine = [tickets[x] for x in n["tickets"] if x in tickets]
                    state = merge_states([states[t["number"]] for t in mine])
                    lines.append(f'    {n["id"]}["{node_text(n, mine, state)}"]:::{state}')
                    for t in mine:
                        node_of[t["number"]] = n["id"]
        lines.append("  end")
        lines.append("")

    solid: set[tuple[str, str]] = set()
    for n in sorted(tickets):
        for b in tickets[n]["blockedBy"]:
            a, z = node_of.get(b["number"]), node_of.get(n)
            if a and z and a != z:
                solid.add((a, z))
    order = {node_id: i for i, node_id in enumerate(dict.fromkeys(list(node_of.values())))}
    edges = [f"  {a} --> {z}" for a, z in sorted(reduce_transitive(solid), key=lambda e: (order[e[0]], order[e[1]]))]
    for e in layout.get("edges", []):
        m = re.fullmatch(r"\s*(\w+)\s+(-->|-\.->)\s+(\w+)\s*", e)
        if not m:
            raise ValueError(f"layout edge not understood: {e!r}")
        a, arrow, z = alias.get(m[1], m[1]), m[2], alias.get(m[3], m[3])
        if a != z:
            edges.append(f"  {a} {arrow} {z}")
    seen: set[str] = set()
    lines += [e for e in edges if not (e in seen or seen.add(e))]
    lines += ["```", "", LEGEND]
    return "\n".join(lines)


def reduce_transitive(edges: set[tuple[str, str]]) -> set[tuple[str, str]]:
    """Drops A --> C when a longer path of arrows already leads from A to C: the drawing shows the order, not every link."""
    after: dict[str, set[str]] = {}
    for a, z in edges:
        after.setdefault(a, set()).add(z)

    def reachable(start: str, skip: tuple[str, str]) -> set[str]:
        seen, todo = set(), [start]
        while todo:
            x = todo.pop()
            for y in after.get(x, ()):
                if (x, y) != skip and y not in seen:
                    seen.add(y)
                    todo.append(y)
        return seen

    return {(a, z) for a, z in edges if z not in reachable(a, (a, z))}


# ---------------------------------------------------------------- Resume here

def first_line(text: str, width: int = 160) -> str:
    line = next((x.strip() for x in text.splitlines() if x.strip()), "")
    return line if len(line) <= width else line[: width - 1] + "…"


def render_resume(snapshot: dict, layout: dict) -> str:
    now = parse_time(snapshot["now"])
    tickets = {t["number"]: t for t in snapshot["tickets"]}
    repo = layout["repo"]
    rows = []
    for n in sorted(tickets):
        t = tickets[n]
        state = classify(t, tickets, now, layout.get("stale_days", 3))
        if state not in ("wip", "stale"):
            continue
        last = last_activity(t)
        row = f"- {'⏳ **stale** ' if state == 'stale' else ''}[{t['title']}](https://github.com/{repo}/issues/{n})"
        if last:
            row += f", last activity {last.date().isoformat()}"
        if t.get("lastComment"):
            row += f"\n  - last comment: {first_line(t['lastComment']['body'])}"
        if t.get("lastCommit"):
            c = t["lastCommit"]
            row += f"\n  - last commit: `{c['sha'][:7]}` {first_line(c['subject'])}"
        rows.append(row)
    if not rows:
        return "_Nothing in progress._ Takeable now: see the blue nodes."
    return "**In progress:**\n\n" + "\n".join(rows) + "\n\nTakeable otherwise: see the blue nodes."


# ---------------------------------------------------------------- writing between markers

def splice(text: str, name: str, content: str) -> str:
    start, end = f"<!-- devmap:{name}:start -->", f"<!-- devmap:{name}:end -->"
    i, j = text.find(start), text.find(end)
    if i < 0 or j < i:
        raise ValueError(f"no {start} … {end} block")
    return text[: i + len(start)] + "\n" + content + "\n" + text[j:]


# ---------------------------------------------------------------- the Project

def project_changes(snapshot: dict, layout: dict) -> list[dict]:
    """What to add or set so each map ticket shows on the Project with the right Status, Slice and Kind."""
    now = parse_time(snapshot["now"])
    tickets = {t["number"]: t for t in snapshot["tickets"]}
    slices = {x: g.get("slice") for g in layout["group"] for n in g["nodes"] for x in n.get("tickets", [])}
    items = snapshot["project"]["items"]
    changes = []
    for n in sorted(tickets):
        t = tickets[n]
        want = {"Status": STATUS_OPTION[classify(t, tickets, now, layout.get("stale_days", 3))], "Kind": kind(t["labels"])}
        if slices.get(n):
            want["Slice"] = slices[n]
        have = items.get(str(n))
        if have is None:
            changes.append({"number": n, "add": True, "set": want})
            continue
        diff = {k: v for k, v in want.items() if have.get(k) != v}
        if diff:
            changes.append({"number": n, "add": False, "item": have["id"], "set": diff})
    return changes


# ---------------------------------------------------------------- reading the tracker

def gh(*args: str, input: str | None = None) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True, input=input).stdout


def graphql(query: str, **variables) -> dict:
    args = ["api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        args += ["-F" if isinstance(v, int) else "-f", f"{k}={v}"]
    return json.loads(gh(*args))["data"]


TICKETS_QUERY = """query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) { issue(number: $number) { body
    subIssues(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes {
      number title state updatedAt
      labels(first: 20) { nodes { name } } assignees(first: 5) { nodes { login } }
      blockedBy(first: 30) { nodes { number state } }
      comments(last: 1) { nodes { body createdAt } } } } } } }"""

PROJECT_QUERY = """query($owner: String!, $number: Int!, $after: String) {
  user(login: $owner) { projectV2(number: $number) { id
    fields(first: 30) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } }
    items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id
      content { ... on Issue { number repository { nameWithOwner } } }
      fieldValues(first: 20) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name
        field { ... on ProjectV2SingleSelectField { name } } } } } } } } } }"""


def last_commits(numbers: list[int]) -> dict[int, dict]:
    """The newest commit (all branches) naming #n the map's way: a Refs/Closes/Fixes line, or (#n) in the subject."""
    out = subprocess.run(["git", "-C", str(ROOT), "log", "--all", "--format=%H%x1f%cI%x1f%s%x1f%B%x1e"],
                         check=True, capture_output=True, text=True).stdout
    found: dict[int, dict] = {}
    wanted = set(numbers)
    for record in out.split("\x1e"):
        parts = record.strip("\n").split("\x1f")
        if len(parts) < 4:
            continue
        sha, date, subject, body = parts
        named = set(re.findall(r"\(#(\d+)\)", subject))
        for line in body.splitlines():
            if re.match(r"\s*(Refs|Closes|Fixes)\b", line):
                named |= set(re.findall(r"#(\d+)\b", line))
        for n in {int(x) for x in named} & wanted:
            found.setdefault(n, {"sha": sha, "date": date, "subject": subject})
    return found


def take_snapshot(layout: dict) -> dict:
    owner, name = layout["repo"].split("/")
    tickets, body, after = [], "", None
    while True:
        data = graphql(TICKETS_QUERY, owner=owner, name=name, number=layout["map_issue"], **({"after": after} if after else {}))
        issue = data["repository"]["issue"]
        body = issue["body"]
        page = issue["subIssues"]
        for x in page["nodes"]:
            tickets.append({
                "number": x["number"], "title": x["title"], "state": x["state"], "updatedAt": x["updatedAt"],
                "labels": [l["name"] for l in x["labels"]["nodes"]],
                "assignees": [a["login"] for a in x["assignees"]["nodes"]],
                "blockedBy": x["blockedBy"]["nodes"],
                "lastComment": (x["comments"]["nodes"] or [None])[0],
            })
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    commits = last_commits([t["number"] for t in tickets])
    for t in tickets:
        t["lastCommit"] = commits.get(t["number"])

    items, fields, project_id, after = {}, {}, None, None
    while True:
        data = graphql(PROJECT_QUERY, owner=layout["project_owner"], number=layout["project_number"], **({"after": after} if after else {}))
        p = data["user"]["projectV2"]
        project_id = p["id"]
        fields = {f["name"]: {"id": f["id"], "options": {o["name"]: o["id"] for o in f["options"]}}
                  for f in p["fields"]["nodes"] if f}
        for it in p["items"]["nodes"]:
            c = it["content"] or {}
            if c.get("repository", {}).get("nameWithOwner") != layout["repo"]:
                continue
            values = {v["field"]["name"]: v["name"] for v in it["fieldValues"]["nodes"] if v and v.get("field")}
            items[str(c["number"])] = {"id": it["id"], **values}
        if not p["items"]["pageInfo"]["hasNextPage"]:
            break
        after = p["items"]["pageInfo"]["endCursor"]
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {"now": now, "mapBody": body, "tickets": tickets,
            "project": {"id": project_id, "fields": fields, "items": items}}


# ---------------------------------------------------------------- writing

def apply_project(changes: list[dict], snapshot: dict, layout: dict) -> None:
    fields = snapshot["project"]["fields"]
    pid = snapshot["project"]["id"]
    for c in changes:
        item = c.get("item")
        if c["add"]:
            url = f"https://github.com/{layout['repo']}/issues/{c['number']}"
            item = json.loads(gh("project", "item-add", str(layout["project_number"]), "--owner", layout["project_owner"],
                                 "--url", url, "--format", "json"))["id"]
        for field, value in c["set"].items():
            f = fields[field]
            gh("project", "item-edit", "--project-id", pid, "--id", item, "--field-id", f["id"],
               "--single-select-option-id", f["options"][value])


def plan(snapshot: dict, layout: dict, overview: str) -> tuple[str, str, list[dict]]:
    diagram = render_diagram(snapshot, layout)
    body = splice(splice(snapshot["mapBody"], "diagram", diagram), "resume", render_resume(snapshot, layout))
    return body, splice(overview, "diagram", diagram), project_changes(snapshot, layout)


def show_diff(name: str, old: str, new: str) -> None:
    sys.stdout.writelines(difflib.unified_diff(old.splitlines(True), new.splitlines(True), f"{name} (now)", f"{name} (redrawn)"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("command", nargs="?", choices=["redraw", "snapshot"], default="redraw")
    ap.add_argument("--dry-run", action="store_true", help="print what would change, write nothing")
    ap.add_argument("--snapshot", type=pathlib.Path, help="use a recorded snapshot instead of the tracker (implies --dry-run)")
    args = ap.parse_args(argv)
    layout = tomllib.loads(LAYOUT.read_text())
    snapshot = json.loads(args.snapshot.read_text()) if args.snapshot else take_snapshot(layout)
    if args.command == "snapshot":
        json.dump(snapshot, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0
    overview = OVERVIEW.read_text()
    body, new_overview, changes = plan(snapshot, layout, overview)
    if args.dry_run or args.snapshot:
        show_diff(f"#{layout['map_issue']} body", snapshot["mapBody"], body)
        show_diff("docs/overview.md", overview, new_overview)
        for c in changes:
            print(f"Project: #{c['number']} {'add, ' if c['add'] else ''}set {c['set']}")
        if body == snapshot["mapBody"] and new_overview == overview and not changes:
            print("Nothing to change.")
        return 0
    if body != snapshot["mapBody"]:
        gh("issue", "edit", str(layout["map_issue"]), "--repo", layout["repo"], "--body-file", "-", input=body)
        print(f"#{layout['map_issue']}: diagram and Resume here redrawn")
    if new_overview != overview:
        OVERVIEW.write_text(new_overview)
        print("docs/overview.md: diagram redrawn (commit it)")
    apply_project(changes, snapshot, layout)
    for c in changes:
        print(f"Project: #{c['number']} {'added, ' if c['add'] else ''}set {c['set']}")
    if body == snapshot["mapBody"] and new_overview == overview and not changes:
        print("Nothing to change.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
