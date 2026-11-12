# SPDX-License-Identifier: LGPL-2.1
"""Output filter sheet: the Twist's L and C against the ripple you want.

Every number comes from a formula below that you can read and change. The
Design workbench runs ``python ownstudio/design/output_filter.py --json`` and
draws the result; changing L or C there writes them on the canvas, and the
plant (ownstudio/plant/twist_buck.pulsim) uses the same values.

Buck converter in continuous conduction. Units: V, A, H, F, Hz, s.

    python ownstudio/design/output_filter.py [--L H] [--C F] [--v-out V] [--json]
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

sys.dont_write_bytecode = True  # no __pycache__ in the setup's tree
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import operating_point  # noqa: E402  (the sibling file, kept in the setup)


def inductor_ripple(v_in: float, v_out: float, inductance: float, f_sw: float) -> float:
    """Peak-to-peak inductor current ripple: ΔI_L = (V_in − V_out)·D / (L·f_sw), D = V_out / V_in."""
    return (v_in - v_out) * (v_out / v_in) / (inductance * f_sw)


def output_ripple(delta_i: float, capacitance: float, f_sw: float) -> float:
    """Peak-to-peak output ripple of an ideal capacitor: ΔV = ΔI_L / (8·C·f_sw)."""
    return delta_i / (8.0 * capacitance * f_sw)


def resonance(inductance: float, capacitance: float) -> float:
    """Natural frequency of the LC filter: f₀ = 1 / (2π·√(L·C))."""
    return 1.0 / (2.0 * math.pi * math.sqrt(inductance * capacitance))


def inductance_for_ripple(v_in: float, v_out: float, delta_i: float, f_sw: float) -> float:
    """Smallest L that keeps the current ripple at or below ΔI_L."""
    return (v_in - v_out) * (v_out / v_in) / (delta_i * f_sw)


def capacitance_for_ripple(delta_i: float, delta_v: float, f_sw: float) -> float:
    """Smallest C that keeps the output ripple at or below ΔV."""
    return delta_i / (8.0 * delta_v * f_sw)


def passive_dip(delta_step: float, inductance: float, capacitance: float) -> float:
    """Dip of an undamped LC filter when the load steps and nothing reacts: ΔI_step·√(L/C)."""
    return delta_step * math.sqrt(inductance / capacitance)


def size(op: dict, v_out: float = 12.0, ripple_ratio: float = 0.4, ripple_max_V: float = 0.1,
         step_A: float = 0.5, i_max: float = 1.5) -> dict:
    """The sheet: {inputs, values, results: [{id, title, value, unit, formula, setup, meets, note?}]}."""
    v_in, f_sw = op["v_in_V"], op["switching_freq_Hz"]
    if not 0 < v_out < v_in:
        raise ValueError(f"V_out must be between 0 and V_in ({v_in:g} V) for a buck")
    L, C = op["inductance_H"], op["ceramic_capacitance_F"]
    C_all = C + op["electrolytic_capacitance_F"]
    i_out = v_out / op["load_ohm"]
    i_design = max(i_out, i_max)
    delta_i = inductor_ripple(v_in, v_out, L, f_sw)
    delta_v = output_ripple(delta_i, C, f_sw)
    L_min = inductance_for_ripple(v_in, v_out, ripple_ratio * i_design, f_sw)
    continuous = delta_i / 2.0 < i_out
    C_min = capacitance_for_ripple(delta_i, ripple_max_V, f_sw)
    dip = passive_dip(step_A, L, C_all)
    results = [
        {"id": "duty", "title": "Duty cycle", "value": v_out / v_in, "unit": "",
         "formula": "D = V_out / V_in", "setup": None, "meets": None},
        {"id": "i_out", "title": "Load current", "value": i_out, "unit": "A",
         "formula": "I_out = V_out / R_load", "setup": None, "meets": None},
        {"id": "ripple_i", "title": "Inductor current ripple", "value": delta_i, "unit": "A",
         "formula": "ΔI_L = (V_in − V_out)·D / (L·f_sw)", "setup": None,
         "meets": delta_i <= ripple_ratio * i_design,
         "note": f"{delta_i / i_design:.0%} of the {i_design:g} A design load; the target is {ripple_ratio:.0%}."},
        {"id": "i_valley", "title": "Lowest inductor current in a period", "value": i_out - delta_i / 2.0,
         "unit": "A", "formula": "I_valley = I_out − ΔI_L / 2", "setup": None, "meets": None,
         "note": "Positive: the current never reverses." if continuous else
                 "Negative: the Twist switches both transistors (synchronous buck), so the current reverses "
                 "for part of each period instead of stopping. The formulas still hold; the reversed current "
                 "only circulates and adds losses."},
        {"id": "ripple_v", "title": "Output voltage ripple", "value": delta_v, "unit": "V",
         "formula": "ΔV = ΔI_L / (8·C·f_sw)", "setup": None, "meets": delta_v <= ripple_max_V,
         "note": "At 200 kHz the ceramics carry the ripple; the electrolytic's ESR keeps it out."},
        {"id": "L_min", "title": f"Inductance for {ripple_ratio:.0%} ripple at {i_design:g} A", "value": L_min, "unit": "H",
         "formula": "L ≥ (V_in − V_out)·D / (ΔI_L·f_sw)", "setup": L, "meets": L >= L_min},
        {"id": "C_min", "title": f"Ceramic capacitance for {ripple_max_V * 1e3:g} mV ripple", "value": C_min,
         "unit": "F", "formula": "C ≥ ΔI_L / (8·ΔV·f_sw)", "setup": C, "meets": C >= C_min},
        {"id": "f0", "title": "Filter resonance (all LOW capacitors)", "value": resonance(L, C_all), "unit": "Hz",
         "formula": "f₀ = 1 / (2π·√(L·C))", "setup": None, "meets": None},
        {"id": "dip", "title": f"Passive dip for a {step_A:g} A load step", "value": dip, "unit": "V",
         "formula": "ΔV = ΔI_step·√(L/C)", "setup": None, "meets": None,
         "note": "Before any controller reacts; ESR damping ignored, so pessimistic."},
    ]
    # Ripple against L, for the sheet's curve: the same formulas from 10 µH to 150 µH.
    sweep = [10e-6 * 15 ** (k / 60) for k in range(61)]
    curve = {"inductance_H": sweep,
             "ripple_V": [output_ripple(inductor_ripple(v_in, v_out, x, f_sw), C, f_sw) for x in sweep]}
    return {"inputs": {"v_in_V": v_in, "v_out_V": v_out, "load_ohm": op["load_ohm"], "f_sw_Hz": f_sw,
                       "ripple_ratio": ripple_ratio, "i_max_A": i_max, "ripple_max_V": ripple_max_V, "step_A": step_A},
            "board": {"inductance_H": op["board_inductance_H"], "capacitance_F": op["board_capacitance_F"]},
            "curve": curve,
            "values": {"inductance_H": L, "capacitance_F": C,
                       "electrolytic_capacitance_F": op["electrolytic_capacitance_F"]},
            "source": op["source"], "results": results}


def _eng(value: float, unit: str) -> str:
    for factor, prefix in ((1e-9, "n"), (1e-6, "µ"), (1e-3, "m"), (1.0, ""), (1e3, "k")):
        if abs(value) < factor * 1000:
            return f"{value / factor:.3g} {prefix}{unit}"
    return f"{value:.3g} {unit}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Size the output filter of the setup's Twist")
    parser.add_argument("--setup", default=str(operating_point.SETUP), help="the setup folder")
    parser.add_argument("--L", type=float, help="inductance to try, in H (default: the canvas)")
    parser.add_argument("--C", type=float, help="ceramic capacitance to try, in F (default: the canvas)")
    parser.add_argument("--v-out", type=float, default=12.0)
    parser.add_argument("--ripple-ratio", type=float, default=0.4)
    parser.add_argument("--ripple-max", type=float, default=0.1,
                        help="output ripple limit, in V (the buck example's REQ-RIPPLE)")
    parser.add_argument("--step", type=float, default=0.5, help="load step, in A")
    parser.add_argument("--i-max", type=float, default=1.5,
                        help="largest load current you design for, in A (the step-4 load step ends at 1.5 A)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    op = operating_point.read(args.setup)
    for key, value in (("inductance_H", args.L), ("ceramic_capacitance_F", args.C)):
        if value is not None:
            if not (math.isfinite(value) and value > 0):
                parser.error(f"{key} must be positive")
            op[key] = value
    result = size(op, args.v_out, args.ripple_ratio, args.ripple_max, args.step, args.i_max)
    if args.json:
        print(json.dumps(result))
        return 0
    for r in result["results"]:
        setup = f"  setup: {_eng(r['setup'], r['unit'])}" if r["setup"] is not None else ""
        verdict = "" if r["meets"] is None else ("  ok" if r["meets"] else "  NOT MET")
        print(f"{r['title']}: {_eng(r['value'], r['unit'])}   [{r['formula']}]{setup}{verdict}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
