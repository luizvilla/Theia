# SPDX-License-Identifier: LGPL-2.1
"""Test registration, as in Core2: catalogue, campaigns, findings register, states.

A mission declares its tests once in ``tests/catalogue.yaml``. Each run of a
procedure writes a test record into a campaign folder,
``records/<date>_<commit>[-dirty]_<time>/<procedure>/record.json``, which is never
overwritten. ``tests/findings.yaml`` links failing criteria to issues. From these
three, ``states()`` says where the validation stands, and ``control_center`` turns
that into a page.

    python -m ownstudio_lab.testing MISSION [--json] [--html OUT]
"""
from __future__ import annotations

import datetime
import hashlib
import html
import json
import pathlib
import platform
import subprocess

import yaml

# Display states of a test, worst first (Core2's). Colour is never the only cue:
# each state has an icon and a word.
STATES = [
    ("fail", "✗", "Failing"),
    ("known", "✗", "Failing (known)"),
    ("blocked_run", "–", "Blocked in last run"),
    ("pass", "✓", "Passed"),
    ("info", "i", "Run (information only)"),
    ("not_run", "○", "Not run yet"),
    ("blocked", "–", "Blocked"),
    ("planned", "◌", "Not implemented"),
]
STATE_ORDER = [s for s, _, _ in STATES]
LABEL = {s: (icon, word) for s, icon, word in STATES}

LEVELS = ("model", "L0", "L1", "L2", "bench")
STATUSES = ("implemented", "partial", "planned", "blocked")
TARGETS = ("pc", "simulator", "board")


class CatalogueError(Exception):
    pass


# Catalogue -----------------------------------------------------------------

def load_catalogue(mission: pathlib.Path) -> dict:
    """Read and check tests/catalogue.yaml. Raises CatalogueError with every problem found."""
    path = mission / "tests" / "catalogue.yaml"
    data = yaml.safe_load(path.read_text()) or {}
    problems = []
    tabs = data.get("tabs") or []
    tab_ids = [t.get("id") for t in tabs]
    tests = data.get("tests") or []
    seen = set()
    for t in tests:
        tid = t.get("id")
        if not tid:
            problems.append(f"a test has no id: {t}")
            continue
        if tid in seen:
            problems.append(f"{tid}: defined twice")
        seen.add(tid)
        for key in ("tab", "level", "title", "criterion", "status", "target"):
            if key not in t:
                problems.append(f"{tid}: missing '{key}'")
        if t.get("tab") not in tab_ids:
            problems.append(f"{tid}: tab '{t.get('tab')}' is not declared")
        levels = t.get("level") if isinstance(t.get("level"), list) else [t.get("level")]
        for level in levels:
            if level not in LEVELS:
                problems.append(f"{tid}: level '{level}' is not one of {', '.join(LEVELS)}")
        if t.get("status") not in STATUSES:
            problems.append(f"{tid}: status '{t.get('status')}' is not one of {', '.join(STATUSES)}")
        targets = t.get("target") if isinstance(t.get("target"), list) else [t.get("target")]
        for target in targets:
            if target not in TARGETS:
                problems.append(f"{tid}: target '{target}' is not one of {', '.join(TARGETS)}")
        if t.get("status") == "blocked" and not t.get("blocked_by"):
            problems.append(f"{tid}: blocked, but 'blocked_by' does not say by what")
    if problems:
        raise CatalogueError("\n".join(problems))
    return {"tabs": tabs, "tests": tests}


def check_requirements(mission: pathlib.Path, catalogue: dict) -> list[str]:
    """Both directions: every verified_by names a catalogued test, and every test's
    requirements exist and list that test."""
    reqs = yaml.safe_load((mission / "requirements.yaml").read_text())["requirements"]
    by_id = {r["id"]: r for r in reqs}
    tests = {t["id"]: t for t in catalogue["tests"]}
    problems = []
    for r in reqs:
        if not r.get("verified_by"):
            problems.append(f"{r['id']}: no test case verifies it")
        for tid in r.get("verified_by") or []:
            if tid not in tests:
                problems.append(f"{r['id']}: verified_by {tid}, which is not in the catalogue")
    for t in catalogue["tests"]:
        for rid in t.get("requirements") or []:
            if rid not in by_id:
                problems.append(f"{t['id']}: requirement {rid} does not exist")
            elif t["id"] not in (by_id[rid].get("verified_by") or []):
                problems.append(f"{t['id']}: says it verifies {rid}, but {rid} does not list it")
    return problems


# Findings register ---------------------------------------------------------

def load_findings(mission: pathlib.Path) -> list[dict]:
    path = mission / "tests" / "findings.yaml"
    if not path.exists():
        return []
    return (yaml.safe_load(path.read_text()) or {}).get("findings") or []


def finding_for(case_id: str, findings: list[dict]) -> dict | None:
    """The open finding covering a criterion. A test id (LINK-01) covers its sub-criteria (LINK-01.a)."""
    for f in findings:
        if f.get("status", "open") != "open":
            continue
        for c in f.get("criteria") or []:
            if case_id == c or case_id.startswith(c + "."):
                return f
    return None


# Campaigns and records -----------------------------------------------------

def mission_identity(mission: pathlib.Path) -> dict:
    def git(*args):
        return subprocess.run(["git", "-C", str(mission), *args], capture_output=True, text=True).stdout.strip()
    return {"commit": git("rev-parse", "HEAD") or "unknown",
            "dirty": bool(git("status", "--porcelain", "--", "."))}


def new_campaign(mission: pathlib.Path, records: pathlib.Path | None = None,
                 now: datetime.datetime | None = None) -> pathlib.Path:
    """A fresh campaign folder: records/<date>_<commit>[-dirty]_<time>. Never reused."""
    records = records or mission / "records"
    now = now or datetime.datetime.now()
    ident = mission_identity(mission)
    stem = f"{now:%Y-%m-%d}_{ident['commit'][:7]}{'-dirty' if ident['dirty'] else ''}_{now:%H%M%S}"
    path, n = records / stem, 1
    while path.exists():
        n += 1
        path = records / f"{stem}-{n}"
    path.mkdir(parents=True)
    return path


def _sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _show(value) -> str:
    text = f"{value:.4g}" if isinstance(value, (int, float)) and not isinstance(value, bool) else str(value)
    return text.replace("|", "\\|")


def case_verdict(case: dict) -> str:
    """PASS, FAIL, BLOCKED or INFO. Cases say passed: true/false, or verdict: BLOCKED/INFO."""
    if case.get("verdict") in ("BLOCKED", "INFO"):
        return case["verdict"]
    return "PASS" if case.get("passed") else "FAIL"


def write_record(out: pathlib.Path, procedure: str, level: str, target: str, cases: list[dict],
                 mission: pathlib.Path, inputs: dict[str, pathlib.Path] | None = None,
                 versions: dict[str, str] | None = None, board: dict | None = None,
                 operator: dict | None = None, conditions: dict | None = None) -> bool:
    """Write record.json and record.md. Returns True unless a case fails.

    cases: [{id, title, criterion, measured, expected, unit, passed}] or, for a case
    that only informs or could not run, verdict: INFO / BLOCKED (with a reason).
    board: serial number and the build identity it reports (board target).
    operator: values typed in by the operator at the bench (multimeter readings...).
    conditions: what the run was done at, named with their unit (v_high_V, load_ohm...):
    a board run's simulation twin is run at the same conditions."""
    out.mkdir(parents=True, exist_ok=True)
    verdicts = [case_verdict(c) for c in cases]
    verdict = "FAIL" if "FAIL" in verdicts else "BLOCKED" if "BLOCKED" in verdicts else "PASS"
    record = {
        "procedure": procedure, "level": level, "target": target,
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "verdict": verdict,
        "mission": mission_identity(mission),
        "inputs": {name: _sha256(path) for name, path in (inputs or {}).items()},
        "versions": {"python": platform.python_version(), **(versions or {})},
        "cases": cases,
    }
    if board is not None:
        record["board"] = board
    if operator is not None:
        record["operator"] = operator
    if conditions:
        record["conditions"] = conditions
    (out / "record.json").write_text(json.dumps(record, indent=2) + "\n")
    lines = [f"# Test record: {procedure}", "",
             f"- Verdict: **{verdict}**",
             f"- Level {level}, target {target}, {record['date']}",
             f"- Mission commit `{record['mission']['commit'][:12]}`"
             + (" (dirty: not reproducible)" if record["mission"]["dirty"] else ""),
             "- Versions: " + ", ".join(f"{k} {v}" for k, v in record["versions"].items())]
    if board is not None:
        lines.append(f"- Board `{board.get('serial_number')}` running commit `{str(board.get('commit'))[:12]}`"
                     f"{' (dirty)' if board.get('dirty') else ''}, sources `{board.get('source_hash')}`")
    if conditions:
        lines.append("- Conditions: " + ", ".join(f"{k} = {_show(v)}" for k, v in conditions.items()))
    if operator:
        lines.append("- Entered by the operator: " + ", ".join(f"{k} = {_show(v)}" for k, v in operator.items()))
    lines += ["",
              "| Case | Requirement | Check | Measured | Expected | Criterion | Verdict |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for c, v in zip(cases, verdicts):
        unit = c.get("unit", "")
        measured = f"{_show(c['measured'])} {unit}" if "measured" in c else "—"
        expected = f"{_show(c['expected'])} {unit}" if "expected" in c else "—"
        lines.append(f"| {c['id']} | {c.get('requirement', '—')} | {c['title']} | {measured} | {expected} | "
                     f"{str(c.get('criterion', c.get('reason', ''))).replace('|', chr(92) + '|')} | {v} |")
    if record["inputs"]:
        lines += ["", "Input hashes (SHA-256):", ""] + [f"- `{k}`: `{v[:16]}…`" for k, v in record["inputs"].items()]
    (out / "record.md").write_text("\n".join(lines) + "\n")
    return verdict != "FAIL"


def load_records(records: pathlib.Path) -> list[dict]:
    """Every record under records/, newest first. Each gets 'path' and 'campaign'."""
    found = []
    if not records.exists():
        return found
    for path in records.rglob("record.json"):
        try:
            rec = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        rec["path"] = str(path.parent)
        rel = path.parent.relative_to(records).parts
        rec["campaign"] = rel[0] if len(rel) > 1 else ""
        found.append(rec)
    return sorted(found, key=lambda r: r.get("date", ""), reverse=True)


# States --------------------------------------------------------------------

def _test_state(test: dict, results: list[tuple[dict, dict]], findings: list[dict]):
    """results: (record, case) pairs for this test, newest record first."""
    finding = None
    if not results:
        state = {"implemented": "not_run", "partial": "not_run", "blocked": "blocked"}.get(test["status"], "planned")
        return state, None, None
    newest_date = results[0][0].get("date")
    latest = [(r, c) for r, c in results if r.get("date") == newest_date]
    verdicts = []
    for _, case in latest:
        v = case_verdict(case)
        if v == "FAIL":
            f = finding_for(case["id"], findings)
            if f:
                finding = finding or f
                v = "KNOWN"
        verdicts.append(v)
    if "FAIL" in verdicts:
        state = "fail"
    elif "KNOWN" in verdicts:
        state = "known"
    elif "BLOCKED" in verdicts:
        state = "blocked_run"
    elif "PASS" in verdicts:
        state = "pass"
    else:
        state = "info"
    return state, latest[0][0], finding


def states(mission: pathlib.Path, records: pathlib.Path | None = None) -> dict:
    """Where the validation stands: one entry per catalogued test, per requirement, per finding."""
    catalogue = load_catalogue(mission)
    findings = load_findings(mission)
    recs = load_records(records or mission / "records")
    by_case: dict[str, list] = {}
    stray = set()
    ids = {t["id"] for t in catalogue["tests"]}
    for rec in recs:
        for case in rec.get("cases", []):
            tid = _test_of(case["id"], ids)
            if tid is None:
                stray.add(case["id"])
                continue
            by_case.setdefault(tid, []).append((rec, case))
    tests = []
    for t in catalogue["tests"]:
        state, rec, finding = _test_state(t, by_case.get(t["id"], []), findings)
        latest = None
        if rec is not None:
            cases = [c for r, c in by_case[t["id"]] if r is rec]
            latest = {"date": rec.get("date"), "campaign": rec.get("campaign"), "path": rec.get("path"),
                      "target": rec.get("target"), "board": rec.get("board"), "mission": rec.get("mission"),
                      "twin": rec.get("twin"), "cases": cases}
        tests.append({**t, "state": state, "latest": latest,
                      "finding": {"issue": finding.get("issue"), "cause": finding.get("cause")} if finding else None})
    by_id = {t["id"]: t for t in tests}
    reqs = yaml.safe_load((mission / "requirements.yaml").read_text())["requirements"]
    requirements = [{"id": r["id"], "title": r.get("title", ""), **_requirement_state(r, by_id)} for r in reqs]
    finding_rows = []
    for f in findings:
        covered = [by_id[_test_of(c, ids)] for c in f.get("criteria") or [] if _test_of(c, ids)]
        ready = f.get("status", "open") == "open" and covered and all(t["state"] == "pass" for t in covered)
        finding_rows.append({**f, "ready_to_close": bool(ready)})
    return {"tabs": catalogue["tabs"], "tests": tests, "requirements": requirements,
            "findings": finding_rows, "unknown_cases": sorted(stray),
            "campaigns": sorted({r["campaign"] for r in recs if r["campaign"]}, reverse=True)}


def _test_of(case_id: str, ids: set) -> str | None:
    """The catalogued test a case id belongs to: itself, or its prefix before a '.'."""
    if case_id in ids:
        return case_id
    head = case_id.split(".")[0]
    return head if head in ids else None


def _requirement_state(req: dict, tests: dict) -> dict:
    """Same vocabulary as Home's Verification layer:
    no-case, untested, sim-pass, bench-pass, fail, known, disagree."""
    linked = [tests[t] for t in req.get("verified_by") or [] if t in tests]
    if not linked:
        return {"state": "no-case", "tests": []}
    names = [t["id"] for t in linked]
    passed = {t["latest"]["target"] for t in linked if t["state"] == "pass"}
    failed = {t["latest"]["target"] for t in linked if t["state"] in ("fail", "known")}
    states_ = [t["state"] for t in linked]
    if passed and failed and passed != failed and (passed - failed) and (failed - passed):
        state = "disagree"     # passes on one target, fails on the other
    elif "fail" in states_:
        state = "fail"
    elif "known" in states_:
        state = "known"
    elif not passed:
        state = "untested"
    else:
        state = "bench-pass" if "board" in passed else "sim-pass"
    return {"state": state, "tests": names}


# Control center ------------------------------------------------------------

_CSS = """
:root{--bg:#fff;--fg:#1a1a1a;--muted:#5c5c5c;--line:#d9d9d9;--green:#234D45;--fail:#B3261E;--known:#B35A00;
--pass:#1E6B3A;--soft:#f3f5f4;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#141716;--fg:#ececec;--muted:#a8a8a8;--line:#333;--fail:#FF8A80;
--known:#FFB74D;--pass:#81C995;--soft:#1d2221}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
header{background:var(--green);color:#fff;padding:14px 20px}header h1{margin:0;font-size:20px}
header p{margin:4px 0 0;opacity:.85;font-size:13px}main{padding:16px 20px;max-width:1200px}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.summary span{background:var(--soft);
border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:13px}
nav{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--line);margin-bottom:12px}
nav button{background:none;border:0;border-bottom:3px solid transparent;color:var(--fg);padding:8px 12px;
font:inherit;cursor:pointer}nav button[aria-selected=true]{border-color:var(--green);font-weight:600}
section[hidden]{display:none}.question{color:var(--muted);margin:0 0 10px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);
vertical-align:top;font-size:14px}th{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.st{white-space:nowrap;font-weight:600}.fail{color:var(--fail)}.known{color:var(--known)}.pass{color:var(--pass)}
.blocked_run,.blocked,.planned,.not_run,.info{color:var(--muted)}code{font-size:13px}a{color:inherit}
.wrap{overflow-x:auto}
"""


def _join(value) -> str:
    return ", ".join(value) if isinstance(value, list) else str(value)


def control_center_html(mission: pathlib.Path, data: dict, title: str | None = None) -> str:
    e = html.escape
    title = title or f"Control center: {mission.name}"
    counts: dict[str, int] = {}
    for t in data["tests"]:
        counts[t["state"]] = counts.get(t["state"], 0) + 1
    summary = "".join(f'<span class="{s}">{LABEL[s][0]} {LABEL[s][1]}: {counts[s]}</span>'
                      for s in STATE_ORDER if s in counts)
    tabs = data["tabs"] + [{"id": "_requirements", "title": "Requirements"}, {"id": "_findings", "title": "Findings"}]
    nav = "".join(f'<button role="tab" aria-selected="{"true" if i == 0 else "false"}" data-tab="{e(t["id"])}">'
                  f'{e(t["title"])}</button>' for i, t in enumerate(tabs))
    sections = []
    for i, tab in enumerate(data["tabs"]):
        rows = []
        for t in (x for x in data["tests"] if x["tab"] == tab["id"]):
            icon, word = LABEL[t["state"]]
            latest = t["latest"]
            where = ""
            if latest:
                rel = pathlib.Path(latest["path"])
                link = f'<a href="{e(rel.as_uri())}/record.md">{e(latest["campaign"] or rel.name)}</a>'
                where = f'{link}<br><small>{e(latest["target"] or "")} · {e((latest["date"] or "")[:16])}</small>'
            measured = ""
            if latest:
                measured = "<br>".join(
                    f'{e(c["id"])}: {e(_show(c.get("measured", "—")))} {e(c.get("unit", ""))}' for c in latest["cases"])
            issue = ""
            if t["finding"]:
                issue = f'<a href="{e(t["finding"]["issue"])}">{e(t["finding"]["issue"].rsplit("/", 1)[-1])}</a>'
            extra = f'<br><small>Blocked by: {e(t["blocked_by"])}</small>' if t.get("blocked_by") else ""
            rows.append(
                f'<tr><td class="st {t["state"]}">{icon} {word}</td><td><code>{e(t["id"])}</code></td>'
                f'<td>{e(t["title"])}<br><small>{e(_join(t["level"]))} · {e(_join(t["target"]))} · {e(", ".join(t["requirements"]) if t.get("requirements") else "no requirement")}</small>{extra}</td>'
                f'<td>{e(t["criterion"])}</td><td>{measured}</td><td>{where}</td><td>{issue}</td></tr>')
        sections.append(
            f'<section id="{e(tab["id"])}" {"" if i == 0 else "hidden"}><p class="question">{e(tab.get("question", ""))}</p>'
            '<div class="wrap"><table><thead><tr><th>State</th><th>Test</th><th>What</th><th>Criterion</th>'
            '<th>Measured</th><th>Latest record</th><th>Issue</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table></div></section>")
    req_rows = "".join(
        f'<tr><td><code>{e(r["id"])}</code></td><td>{e(r["title"])}</td><td>{e(r["state"])}</td>'
        f'<td>{e(", ".join(r["tests"]))}</td></tr>' for r in data["requirements"])
    sections.append('<section id="_requirements" hidden><div class="wrap"><table><thead><tr><th>Requirement</th>'
                    '<th>Title</th><th>Verification</th><th>Tests</th></tr></thead><tbody>'
                    + req_rows + "</tbody></table></div></section>")
    f_rows = "".join(
        f'<tr><td><a href="{e(f.get("issue", ""))}">{e(str(f.get("issue", "")).rsplit("/", 1)[-1])}</a></td>'
        f'<td>{e(", ".join(f.get("criteria") or []))}</td><td>{e(f.get("cause", ""))}</td>'
        f'<td>{e(f.get("status", "open"))}{" · ready to close" if f["ready_to_close"] else ""}</td></tr>'
        for f in data["findings"])
    sections.append('<section id="_findings" hidden><div class="wrap"><table><thead><tr><th>Issue</th><th>Criteria</th>'
                    '<th>Cause</th><th>Status</th></tr></thead><tbody>' + f_rows + "</tbody></table></div></section>")
    stray = ""
    if data["unknown_cases"]:
        stray = f'<p class="question">Records name cases that are not in the catalogue: {e(", ".join(data["unknown_cases"]))}</p>'
    script = ("document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{"
              "document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',x===b));"
              "document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==b.dataset.tab)})")
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
            f'content="width=device-width,initial-scale=1"><title>{e(title)}</title><style>{_CSS}</style></head>'
            f'<body><header><h1>{e(title)}</h1><p>Generated {now} from the catalogue, the findings register and '
            f'{len(data["campaigns"])} campaigns.</p></header><main><div class="summary">{summary}</div>{stray}'
            f'<nav role="tablist">{nav}</nav>{"".join(sections)}</main><script>{script}</script></body></html>\n')


def main(argv=None) -> int:
    import argparse
    import sys
    parser = argparse.ArgumentParser(description="Where a mission's validation stands")
    parser.add_argument("mission", type=pathlib.Path)
    parser.add_argument("--records", type=pathlib.Path)
    parser.add_argument("--json", action="store_true", help="print the states as JSON")
    parser.add_argument("--html", type=pathlib.Path, help="write the control center page here")
    parser.add_argument("--check", action="store_true", help="check the catalogue against requirements.yaml")
    args = parser.parse_args(argv)
    mission = args.mission.resolve()
    try:
        catalogue = load_catalogue(mission)
    except CatalogueError as err:
        print(f"catalogue errors:\n{err}", file=sys.stderr)
        return 1
    if args.check:
        problems = check_requirements(mission, catalogue)
        for p in problems:
            print(p, file=sys.stderr)
        return 1 if problems else 0
    data = states(mission, args.records)
    if args.html:
        args.html.parent.mkdir(parents=True, exist_ok=True)
        args.html.write_text(control_center_html(mission, data))
        print(f"control center: {args.html}")
    if args.json or not args.html:
        print(json.dumps(data, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
