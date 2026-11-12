# SPDX-License-Identifier: LGPL-2.1
"""Control loop sheet: the voltage loop of the buck on a Bode plot.

Everything here is a formula you can read. The plant is the averaged buck with
the setup's L, its LOW ceramics C, the electrolytic behind its ESR, and the
resistor wired on LOW1:

    G(s) = V_in · Z(s) / (s·L + Z(s)),   Z = R_load ∥ 1/(s·C) ∥ (R_esr + 1/(s·C_elec))

The controller is control_library's Pid as src/control.cpp uses it, sampled
every T (the C-Block's sample time in the plant, the firmware's control task):

    u[k] = Kp · (e[k] + (T/Ti) · Σ e[0..k])   →   C(z) = Kp · (1 + (T/Ti) · z/(z − 1))

The duty is held for one period (zero-order hold) and applied at the next PWM
period. The loop gain is evaluated at z = e^(jωT):

    L(jω) = C(e^(jωT)) · (1 − e^(−jωT)) / (jωT) · e^(−jω/f_sw) · G(jω)

It ignores aliasing, so trust it below about a tenth of the control rate.
``--apply`` changes only the two numbers in ``static const float kp = …F;``
and ``static const float Ti = …F;`` of src/control.cpp.

    python ownstudio/design/control_loop.py [--kp KP] [--ti TI] [--L H] [--C F] [--apply] [--json]
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import sys

import numpy as np

sys.dont_write_bytecode = True  # no __pycache__ in the setup's tree
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import operating_point  # noqa: E402  (the sibling file, kept in the setup)

_GAIN = re.compile(r"static const float (kp|Ti)\s*=\s*([-+0-9.eE]+)F?;")


def read_gains(path: pathlib.Path) -> dict:
    """Kp and Ti as written in control.cpp; each must appear exactly once."""
    found = _GAIN.findall(path.read_text(encoding="utf-8"))
    names = [name for name, _ in found]
    if sorted(names) != ["Ti", "kp"]:
        raise ValueError(f"{path.name} needs exactly one 'static const float kp = …F;' "
                         f"and one 'static const float Ti = …F;' (found {names or 'neither'})")
    values = dict(found)
    return {"kp": float(values["kp"]), "ti": float(values["Ti"])}


def write_gains(path: pathlib.Path, kp: float, ti: float) -> None:
    """Change only the two numbers; everything else in the file stays as written."""
    if not (kp > 0 and ti > 0 and math.isfinite(kp) and math.isfinite(ti)):
        raise ValueError("Kp and Ti must be positive")
    read_gains(path)  # refuses a file it cannot change safely
    values = {"kp": kp, "Ti": ti}

    def replace(m):
        new = values[m.group(1)]
        if math.isclose(float(m.group(2)), new, rel_tol=1e-6):
            return m.group(0)  # unchanged: keep it exactly as written
        return f"static const float {m.group(1)} = {new:.6g}F;"
    text = path.read_text(encoding="utf-8")
    path.write_text(_GAIN.sub(replace, text), encoding="utf-8")


def plant(s: np.ndarray, op: dict) -> np.ndarray:
    """Averaged control-to-output transfer function v_low / duty, in volts per unit duty."""
    z = 1.0 / (1.0 / op["load_ohm"] + s * op["ceramic_capacitance_F"])
    z_elec = op["electrolytic_esr_ohm"] + 1.0 / (s * op["electrolytic_capacitance_F"])
    z = 1.0 / (1.0 / z + 1.0 / z_elec)
    return op["v_in_V"] * z / (s * op["inductance_H"] + z)


def controller(w: np.ndarray, kp: float, ti: float, period_s: float) -> np.ndarray:
    z = np.exp(1j * w * period_s)
    return kp * (1.0 + (period_s / ti) * z / (z - 1.0))


def loop_gain(w: np.ndarray, op: dict, kp: float, ti: float) -> np.ndarray:
    T = op["control_period_s"]
    hold = (1.0 - np.exp(-1j * w * T)) / (1j * w * T)
    pwm_delay = np.exp(-1j * w / op["switching_freq_Hz"])
    return controller(w, kp, ti, T) * hold * pwm_delay * plant(1j * w, op)


def margins(f: np.ndarray, L: np.ndarray) -> dict:
    """Crossover, phase margin and gain margin, read off the sampled curve (interpolated)."""
    mag = np.abs(L)
    phase = np.unwrap(np.angle(L))
    out = {"crossover_Hz": None, "phase_margin_deg": None, "phase_crossover_Hz": None, "gain_margin_dB": None}
    below = np.where((mag[:-1] >= 1.0) & (mag[1:] < 1.0))[0]
    if len(below):
        i = below[0]
        t = math.log(mag[i]) / (math.log(mag[i]) - math.log(mag[i + 1]))
        out["crossover_Hz"] = math.exp(math.log(f[i]) + t * (math.log(f[i + 1]) - math.log(f[i])))
        out["phase_margin_deg"] = math.degrees(phase[i] + t * (phase[i + 1] - phase[i])) + 180.0
    cross = np.where((phase[:-1] > -math.pi) & (phase[1:] <= -math.pi))[0]
    if len(cross):
        i = cross[0]
        t = (phase[i] + math.pi) / (phase[i] - phase[i + 1])
        out["phase_crossover_Hz"] = math.exp(math.log(f[i]) + t * (math.log(f[i + 1]) - math.log(f[i])))
        m = math.exp(math.log(mag[i]) + t * (math.log(mag[i + 1]) - math.log(mag[i])))
        out["gain_margin_dB"] = -20.0 * math.log10(m)
    return out


def analyse(op: dict, kp: float, ti: float, f_min: float = 1.0, points: int = 300) -> dict:
    """Bode data up to the control Nyquist frequency, and the margins."""
    f = np.logspace(math.log10(f_min), math.log10(0.5 / op["control_period_s"]), points)
    w = 2 * math.pi * f

    def bode(H):
        return {"mag_dB": (20 * np.log10(np.abs(H))).tolist(), "phase_deg": np.degrees(np.unwrap(np.angle(H))).tolist()}
    L = loop_gain(w, op, kp, ti)
    c_all = op["ceramic_capacitance_F"] + op["electrolytic_capacitance_F"]
    return {"inputs": {"kp": kp, "ti_s": ti, "period_s": op["control_period_s"], "v_in_V": op["v_in_V"],
                       "load_ohm": op["load_ohm"], "inductance_H": op["inductance_H"],
                       "capacitance_F": op["ceramic_capacitance_F"]},
            "resonance_Hz": 1.0 / (2 * math.pi * math.sqrt(op["inductance_H"] * c_all)),
            "f_Hz": f.tolist(), "plant": bode(plant(1j * w, op)), "controller": bode(controller(w, kp, ti, op["control_period_s"])),
            "loop": bode(L), "margins": margins(f, L), "source": op["source"]}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Bode plot and margins of the buck voltage loop")
    parser.add_argument("--setup", default=str(operating_point.SETUP), help="the setup folder")
    parser.add_argument("--kp", type=float, help="default: src/control.cpp")
    parser.add_argument("--ti", type=float, help="default: src/control.cpp")
    parser.add_argument("--L", type=float, help="inductance to try, in H (default: the canvas)")
    parser.add_argument("--C", type=float, help="ceramic capacitance to try, in F (default: the canvas)")
    parser.add_argument("--apply", action="store_true", help="write --kp and --ti into src/control.cpp")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    setup = pathlib.Path(args.setup)
    control = setup / "src" / "control.cpp"
    op = operating_point.read(setup)
    for key, value in (("inductance_H", args.L), ("ceramic_capacitance_F", args.C)):
        if value is not None:
            op[key] = value
    gains = read_gains(control)
    kp = gains["kp"] if args.kp is None else args.kp
    ti = gains["ti"] if args.ti is None else args.ti
    if args.apply:
        write_gains(control, kp, ti)
    result = analyse(op, kp, ti)
    result["gains_in_control_cpp"] = read_gains(control)
    if args.json:
        print(json.dumps(result))
        return 0
    m = result["margins"]

    def show(v, unit, fmt="{:.3g}"):
        return "none" if v is None else fmt.format(v) + f" {unit}"
    print(f"Kp {kp:g}, Ti {ti:g} s, control period {op['control_period_s'] * 1e6:g} µs; "
          f"filter resonance {result['resonance_Hz']:.0f} Hz")
    print(f"crossover {show(m['crossover_Hz'], 'Hz')}, phase margin {show(m['phase_margin_deg'], '°', '{:.1f}')}, "
          f"gain margin {show(m['gain_margin_dB'], 'dB', '{:.1f}')} at {show(m['phase_crossover_Hz'], 'Hz')}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
