"""Generate reference XRD patterns with pymatgen for frontend/tests/xrd.test.ts.

Usage (from backend/, needs `pip install pymatgen` and MP_API_KEY):
    .venv/Scripts/python tests/make_xrd_fixture.py
"""

import json
import os
from pathlib import Path

import httpx
from pymatgen.analysis.diffraction.xrd import XRDCalculator
from pymatgen.core import Structure

OUT = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "xrd_fixture.json"
# Different crystal systems: hexagonal, cubic (fcc rock salt, bcc, diamond), monoclinic.
FORMULAS = ["GaN", "NaCl", "Fe", "Si", "ZrO2"]


def main() -> None:
    key = os.environ["MP_API_KEY"]
    cases = []
    with httpx.Client(timeout=60) as client:
        for formula in FORMULAS:
            r = client.get(
                "https://api.materialsproject.org/materials/summary/",
                params={"formula": formula, "is_stable": "true", "_fields": "material_id,structure,symmetry", "_limit": 1},
                headers={"x-api-key": key},
            )
            r.raise_for_status()
            doc = r.json()["data"][0]
            structure = Structure.from_dict(doc["structure"])
            cases_for = []
            for radiation in ("CuKa", "MoKa"):
                pattern = XRDCalculator(wavelength=radiation).get_pattern(structure)
                cases_for.append({
                    "radiation": radiation,
                    "two_theta": [round(float(v), 6) for v in pattern.x],
                    "intensity": [round(float(v), 6) for v in pattern.y],
                    "d": [round(float(v), 6) for v in pattern.d_hkls],
                })
            cases.append({
                "formula": formula,
                "material_id": doc["material_id"],
                "spacegroup": doc["symmetry"]["symbol"],
                "structure": {
                    "lattice": {"matrix": structure.lattice.matrix.tolist()},
                    "sites": [
                        {"species": [{"element": sp.symbol, "occu": occ} for sp, occ in site.species.items()], "abc": site.frac_coords.tolist()}
                        for site in structure
                    ],
                },
                "patterns": cases_for,
            })
            print(f"{formula:<5} {doc['material_id']:<12} {doc['symmetry']['symbol']:<8} {len(cases_for[0]['two_theta'])} CuKa peaks")
    OUT.write_text(json.dumps(cases), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
