# SPDX-License-Identifier: LGPL-2.1
"""Run a mission procedure on a target and file its test record in a new campaign.

    python -m ownstudio_lab.procedure MISSION tests/procedures/step_response.py \\
        --target simulator|board [--board SERIAL] [--allow-power] [--twin] [--campaign DIR] [--json]

A procedure is a Python file with

    PROCEDURE = {"title": "...", "targets": ["simulator", "board"],
                 "power_on": {"group": "Converter", "name": "Mode", "value": 1},  # if it switches power on
                 "twin": {"v_in": "v_high_V", "load_ohm": "load_ohm"}}           # simulator option <- condition
    def run(target, ctx): ...

ctx.log(text), ctx.ask_number(question), ctx.confirm(question), ctx.options, and
ctx.record(name, procedure, level, cases, inputs=..., versions=..., operator=..., conditions=..., files=...)
which writes the record into the campaign, stamped with the target's identity.

With --twin, a board run brings its simulation: the runner runs the procedure
again on the simulator, at the conditions the board run recorded (mapped to
the harness's options by PROCEDURE["twin"]), in the same campaign, and links
each board record to its simulator record ("twin" in record.json).

On the board, a procedure that switches power on runs only with --allow-power
(OwnStudio passes it after the user confirms, each time; ADR 0010), and the
target refuses that write otherwise.

With --json the runner talks JSON lines, for the app:
    stdout  {"event": "log", "text"} | {"event": "ask", "id", "kind": "number"|"confirm", "question"}
            {"event": "record", "path", "verdict"} | {"event": "done", "status", "error"?}
    stdin   {"id", "answer"}
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys
import traceback

from . import testing
from .target import TargetError, open_target


class ProcedureError(Exception):
    pass


class Context:
    def __init__(self, mission, target, campaign=None, io=None, options=None):
        self.mission, self.target, self.options = mission, target, options or {}
        self._campaign = campaign
        self.io = io or ConsoleIO()
        self.records = []
        self.conditions = []

    @property
    def campaign(self) -> pathlib.Path:
        if self._campaign is None:
            self._campaign = testing.new_campaign(self.mission)
        return self._campaign

    def log(self, text):
        self.io.log(text)

    def ask_number(self, question) -> float:
        return float(self.io.ask("number", question))

    def confirm(self, question) -> bool:
        return bool(self.io.ask("confirm", question))

    def record(self, name, procedure, level, cases, inputs=None, versions=None, operator=None, files=None,
               conditions=None) -> bool:
        out = self.campaign / name
        out.mkdir(parents=True, exist_ok=True)
        for filename, content in (files or {}).items():
            (out / filename).write_text(content)
        identity = self.target.identity()
        board = identity if self.target.kind == "board" else None
        versions = dict(versions or {})
        if self.target.kind == "simulator" and identity:
            versions.update({k: str(v) for k, v in identity.items()})
        passed = testing.write_record(out, procedure, level, self.target.kind, cases, self.mission,
                                      inputs, versions, board, operator, conditions)
        verdict = json.loads((out / "record.json").read_text())["verdict"]
        self.records.append((out, verdict))
        self.conditions.append(dict(conditions or {}))
        self.io.record(out, verdict)
        return passed


class ConsoleIO:
    def log(self, text):
        print(text, flush=True)

    def ask(self, kind, question):
        while True:
            answer = input(question + (" [y/N] " if kind == "confirm" else " ")).strip()
            if kind == "confirm":
                return answer.lower() in ("y", "yes", "o", "oui")
            try:
                return float(answer.replace(",", "."))
            except ValueError:
                print("a number, please")

    def record(self, path, verdict):
        print(f"record: {path / 'record.md'} ({verdict})", flush=True)

    def done(self, status, error=None):
        if error:
            print(f"ERROR: {error}", file=sys.stderr, flush=True)


class JsonIO:
    def __init__(self, out=sys.stdout, inp=sys.stdin):
        self.out, self.inp, self.next_id = out, inp, 1

    def emit(self, message):
        self.out.write(json.dumps(message) + "\n")
        self.out.flush()

    def log(self, text):
        self.emit({"event": "log", "text": str(text)})

    def ask(self, kind, question):
        ask_id = self.next_id
        self.next_id += 1
        self.emit({"event": "ask", "id": ask_id, "kind": kind, "question": question})
        for line in self.inp:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if message.get("id") == ask_id:
                if message.get("answer") is None:
                    raise ProcedureError("cancelled by the user")
                return message["answer"]
        raise ProcedureError("no answer: the app closed the procedure")

    def record(self, path, verdict):
        self.emit({"event": "record", "path": str(path), "verdict": verdict})

    def done(self, status, error=None):
        message = {"event": "done", "status": status}
        if error:
            message["error"] = error
        self.emit(message)


def load_procedure(path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(f"procedure_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    spec.loader.exec_module(module)
    if not hasattr(module, "run") or not hasattr(module, "PROCEDURE"):
        raise ProcedureError(f"{path.name} has no PROCEDURE and run(target, ctx)")
    return module


def power_guard(power_on, allowed):
    """A guard for BoardTarget: refuse the procedure's power-on write unless allowed."""
    def guard(group, values):
        if not allowed and power_on and group == power_on["group"] and values.get(power_on["name"]) == power_on["value"]:
            raise TargetError("switching the converter on needs the user's confirmation (--allow-power)")
    return guard


def twin_options(meta, conditions):
    """Simulator options for a board run's twin: PROCEDURE["twin"] maps option -> condition name."""
    return {option: conditions[name] for option, name in (meta.get("twin") or {}).items() if name in conditions}


def link_twins(board_records, sim_records, campaign):
    """Write "twin" into each pair of record.json files, as the other record's path in the campaign."""
    for (board_path, _), (sim_path, _) in zip(board_records, sim_records):
        for path, other in ((board_path, sim_path), (sim_path, board_path)):
            rec = json.loads((path / "record.json").read_text())
            rec["twin"] = str(other.relative_to(campaign))
            (path / "record.json").write_text(json.dumps(rec, indent=2) + "\n")


def run_procedure(mission, path, target_kind, io, board=None, allow_power=False, campaign=None, options=None,
                  target=None, twin=False, twin_target=None) -> int:
    """0: every record passed; 1: a record failed; 2: the procedure could not run.
    twin: after a board run, run the procedure on the simulator at the same conditions."""
    module = load_procedure(path)
    meta = module.PROCEDURE
    if target_kind not in meta.get("targets", []):
        raise ProcedureError(f"{path.name} runs on {', '.join(meta.get('targets', []))}, not on the {target_kind}")
    power_on = meta.get("power_on")
    if target_kind == "board" and power_on and not allow_power:
        raise ProcedureError(f"{path.name} switches the converter on: on the board it needs --allow-power")
    if target is None:
        target = open_target(target_kind, mission, board, guard=power_guard(power_on, allow_power), **(options or {}))
    ctx = Context(mission, target, campaign, io, options)
    try:
        module.run(target, ctx)
    finally:
        if power_on and target_kind == "board":
            try:
                target.update(power_on["group"], {power_on["name"]: 0})
            except Exception:  # noqa: BLE001 - best effort, the board may be gone
                pass
        target.close()
    status = 1 if any(v == "FAIL" for _, v in ctx.records) else 0
    if twin and target_kind == "board" and ctx.records:
        run_twin(mission, module, ctx, io, twin_target)
    return status


def run_twin(mission, module, board_ctx, io, sim_target=None):
    """The board run's simulation: same procedure, same campaign, the board's conditions."""
    meta = module.PROCEDURE
    if "simulator" not in meta.get("targets", []):
        io.log("No simulation: this procedure does not run on the simulator.")
        return
    conditions = next((c for c in board_ctx.conditions if c), {})
    options = twin_options(meta, conditions)
    shown = ", ".join(f"{k} = {v:g}" if isinstance(v, (int, float)) else f"{k} = {v}" for k, v in options.items())
    io.log(f"Simulation of this run, at the board's conditions ({shown or 'the simulator defaults'})…")
    try:
        target = sim_target or open_target("simulator", mission, **options)
        ctx = Context(mission, target, board_ctx.campaign, io, dict(board_ctx.options, **options))
        try:
            module.run(target, ctx)
        finally:
            target.close()
    except Exception as err:  # noqa: BLE001 - the board run stands; its twin is a bonus
        io.log(f"The simulation could not run: {type(err).__name__}: {err}")
        return
    link_twins(board_ctx.records, ctx.records, board_ctx.campaign)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run a mission procedure on a target")
    parser.add_argument("mission", type=pathlib.Path)
    parser.add_argument("procedure", type=pathlib.Path, help="path to the procedure, relative to the mission or absolute")
    parser.add_argument("--target", choices=["simulator", "board"], default="simulator")
    parser.add_argument("--board", help="USB serial number of the board")
    parser.add_argument("--allow-power", action="store_true")
    parser.add_argument("--twin", action="store_true", help="after a board run, the same procedure on the simulator")
    parser.add_argument("--campaign", type=pathlib.Path)
    parser.add_argument("--option", action="append", default=[], metavar="NAME=VALUE",
                        help="passed to the procedure as ctx.options (numbers parsed)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    io = JsonIO() if args.json else ConsoleIO()
    mission = args.mission.resolve()
    path = args.procedure if args.procedure.is_absolute() else mission / args.procedure
    options = {}
    for item in args.option:
        name, _, value = item.partition("=")
        try:
            options[name] = float(value)
        except ValueError:
            options[name] = value
    try:
        status = run_procedure(mission, path, args.target, io, args.board, args.allow_power, args.campaign, options,
                               twin=args.twin)
        io.done(status)
        return status
    except (ProcedureError, TargetError) as err:
        io.done(2, str(err))
        return 2
    except Exception as err:  # noqa: BLE001 - report anything to the app, then fail
        io.done(2, f"{type(err).__name__}: {err}\n{traceback.format_exc(limit=3)}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
