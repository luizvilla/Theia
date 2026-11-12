# SPDX-License-Identifier: LGPL-2.1
"""Open a setup plant in PulsimGui with OwnStudio's simulator backend.

PulsimGui remains the editor and waveform UI.  Its transient Run action is
replaced with a narrow adapter around :class:`ownstudio_lab.simulation.Harness`,
the same runner used by procedures and by OwnStudio itself.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import pathlib
import sys
import traceback

import numpy as np

from .simulation import DEFAULT_REFERENCE_V, Harness, load_project, sync_plant_values


def _backend_types():
    from pulsimgui.services.backend_adapter import BackendInfo, BackendLoader, BackendRunResult, PlaceholderBackend
    return BackendInfo, BackendLoader, BackendRunResult, PlaceholderBackend


def backend(mission: pathlib.Path):
    """Build a PulsimGui backend class bound to one setup folder."""
    BackendInfo, _, BackendRunResult, PlaceholderBackend = _backend_types()
    root = pathlib.Path(mission).resolve()
    info = BackendInfo(
        identifier="ownstudio-runner",
        name="OwnStudio runner",
        version="1.0",
        status="available",
        capabilities={"transient"},
        message="Setup plant, native control C-Block and Twist hardware adapter",
    )

    class OwnStudioBackend(PlaceholderBackend):
        def __init__(self):
            super().__init__(info)

        def run_transient(self, circuit_data, settings, callbacks):
            harness = None
            try:
                from pulsimgui.models.circuit import Circuit
                from pulsimgui.models.project import Project

                callbacks.progress(0, "Building OwnStudio's native control C-Block...")
                callbacks.wait_if_paused()
                if callbacks.check_cancelled():
                    return BackendRunResult(error_message="Simulation cancelled")

                circuit = Circuit.from_dict(circuit_data)
                _, _, plant_path, _ = load_project(root)
                project = Project(name="OwnStudio GUI run", path=plant_path, circuits={"main": circuit})
                project.simulation_settings.dt = float(settings.t_step)
                project.simulation_settings.tstart = 0.0
                project.simulation_settings.tstop = max(0.0, float(settings.t_stop) - float(settings.t_start))
                points = max(1, int(settings.output_points))
                store_every = max(1, round(project.simulation_settings.tstop /
                                           max(project.simulation_settings.dt * points, 1e-15)))
                harness = Harness(root, project=project, store_every=store_every)
                harness.update("Converter", {"wVoltageRef_V": DEFAULT_REFERENCE_V, "Mode": 1})

                callbacks.progress(10, "Running the OwnStudio setup simulator...")
                harness.advance(project.simulation_settings.tstop)
                if callbacks.check_cancelled():
                    return BackendRunResult(error_message="Simulation cancelled")
                wave = harness.capture()
                time = np.asarray(wave["t"], dtype=float) + float(settings.t_start)
                signals = {
                    "rV1Low_V": np.asarray(wave["rV1Low_V"], dtype=float),
                    "rI1Low_A": np.asarray(wave["rI1Low_A"], dtype=float),
                }
                if time.size:
                    signals["rVHigh_V"] = np.full(time.shape, harness.q["port_high_V"])
                    signals["wVoltageRef_V"] = np.full(time.shape, DEFAULT_REFERENCE_V)
                    callbacks.data_point(float(time[-1]), {name: float(values[-1]) for name, values in signals.items()})
                identity = harness.identity()
                callbacks.progress(100, "OwnStudio simulation complete")
                return BackendRunResult(
                    time=time.tolist(),
                    signals={name: values.tolist() for name, values in signals.items()},
                    statistics={**identity, "ownstudio_runner": True, "points": int(time.size)},
                )
            except Exception as exc:  # PulsimGui reports backend errors in its normal result pane.
                return BackendRunResult(error_message=str(exc))
            finally:
                if harness is not None:
                    harness.close()

    return info, OwnStudioBackend


def install_backend(mission: pathlib.Path):
    """Make OwnStudio's runner the only backend discovered by this GUI process."""
    info, ownstudio_backend = backend(mission)
    _, BackendLoader, _, _ = _backend_types()

    def discover(_self):
        return {info.identifier: BackendLoader._BackendCandidate(info=info, factory=ownstudio_backend)}

    BackendLoader._discover_candidates = discover
    return info


def open_gui(mission: pathlib.Path, *, check: bool = False, check_run: bool = False,
             screenshot: pathlib.Path | None = None) -> int:
    """Open the setup's real project, optionally exercising the GUI Run action."""
    from PySide6.QtCore import QTimer
    from PySide6.QtWidgets import QApplication

    info = install_backend(mission)
    from pulsimgui.views.main_window import MainWindow

    app = QApplication(sys.argv)
    app.setApplicationName("PulsimGui")
    app.setOrganizationName("OwnStudio")
    app.setStyle("Fusion")
    window = MainWindow()
    window.resize(1700, 1000)
    project, _, path, values = load_project(pathlib.Path(mission))
    if check_run:
        project.simulation_settings.tstop = 0.001
        project.simulation_settings.output_points = 1000
    window._place_project_in_tab(project)
    window.library_dock.hide()
    window.show()
    failures: list[str] = []

    def fail(exc: BaseException) -> None:
        failures.append(str(exc))
        traceback.print_exception(exc)
        app.exit(1)

    def ready() -> None:
        try:
            window._schematic_view.zoom_to_fit()
            window.statusBar().showMessage(
                f"{info.name}: native setup control C-Block; saving syncs Vin, Rload, L and C to OwnStudio."
            )
            if check_run:
                def finished(result) -> None:
                    try:
                        if not result.is_valid:
                            raise RuntimeError(result.error_message)
                        if not result.statistics.get("ownstudio_runner") or not result.statistics.get("native_cblock"):
                            raise RuntimeError("PulsimGui did not use OwnStudio's native C-Block runner")
                        if "rV1Low_V" not in result.signals:
                            raise RuntimeError("OwnStudio's output voltage is missing from the GUI result")
                        print(f"GUI Run executed the OwnStudio runner: {len(result.time)} points", flush=True)
                        QTimer.singleShot(50, app.quit)
                    except BaseException as exc:  # Qt callbacks do not propagate to main().
                        fail(exc)

                window._simulation_service.simulation_finished.connect(finished)
                window._on_run_simulation()
            elif check:
                if not window.action_run.isEnabled():
                    raise RuntimeError("PulsimGui Run is disabled")
                if window._project.path != path:
                    raise RuntimeError("PulsimGui did not open the setup plant in place")
                if screenshot is not None:
                    screenshot.parent.mkdir(parents=True, exist_ok=True)
                    if not window.grab().save(str(screenshot)):
                        raise RuntimeError(f"could not save the PulsimGui screenshot to {screenshot}")
                print(f"GUI loaded {path.name} with OwnStudio values {values}", flush=True)
                QTimer.singleShot(50, app.quit)
        except BaseException as exc:
            fail(exc)

    QTimer.singleShot(500, ready)
    code = app.exec()
    return 1 if failures else code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    launch = sub.add_parser("open", help="open the setup plant in PulsimGui")
    launch.add_argument("setup", type=pathlib.Path)
    launch.add_argument("--check", action="store_true", help="load the real GUI and exit")
    launch.add_argument("--check-run", action="store_true", help="run through the real GUI action and exit")
    launch.add_argument("--screenshot", type=pathlib.Path, help="save the loaded GUI window (with --check)")
    verify = sub.add_parser("check", help="check that the setup and GUI runtime can be opened")
    verify.add_argument("setup", type=pathlib.Path)
    sync = sub.add_parser("sync", help="copy saved named plant values to the setup canvas")
    sync.add_argument("setup", type=pathlib.Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "sync":
            print(json.dumps(sync_plant_values(args.setup)))
            return 0
        if args.command == "check":
            _, _, path, values = load_project(args.setup)
            info, _ = backend(args.setup)
            import PySide6  # noqa: F401 - the launcher requires Qt, not just the project model
            print(json.dumps({"plant": str(path), "values": values, "backend": info.identifier,
                              "pulsimgui": importlib.metadata.version("pulsimgui")}))
            return 0
        return open_gui(args.setup, check=args.check, check_run=args.check_run, screenshot=args.screenshot)
    except Exception as exc:
        if args.command == "sync":
            print(json.dumps({"error": str(exc)}))
        else:
            print(f"PulsimGui could not start: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
