"""Materials Project database lookup.

Replaces the 2023 command-line scripts (Semiconductor.py, Elasticity.py,
Magnetic_Properties.py, ...) with one searchable endpoint over the Materials
Project `materials/summary` REST resource. Each original tool is a preset.
"""

import re
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.config import get_settings

router = APIRouter(prefix="/api/materials", tags=["materials"])

# Numeric fields the summary resource accepts as `<field>_min` / `<field>_max`.
RANGE_FIELDS: dict[str, str] = {
    "band_gap": "Band gap (eV)",
    "density": "Density (g/cm³)",
    "energy_above_hull": "Energy above hull (eV/atom)",
    "formation_energy_per_atom": "Formation energy (eV/atom)",
    "volume": "Volume (Å³)",
    "nsites": "Number of sites",
    "nelements": "Number of elements",
    "efermi": "Fermi energy (eV)",
    "k_vrh": "Bulk modulus, VRH (GPa)",
    "k_voigt": "Bulk modulus, Voigt (GPa)",
    "k_reuss": "Bulk modulus, Reuss (GPa)",
    "g_vrh": "Shear modulus, VRH (GPa)",
    "g_voigt": "Shear modulus, Voigt (GPa)",
    "g_reuss": "Shear modulus, Reuss (GPa)",
    "universal_anisotropy": "Elastic anisotropy",
    "homogeneous_poisson": "Poisson's ratio",
    "total_magnetization": "Total magnetization (μB)",
    "total_magnetization_normalized_vol": "Magnetization / volume (μB/Å³)",
    "total_magnetization_normalized_formula_units": "Magnetization / f.u. (μB/f.u.)",
    "num_magnetic_sites": "Magnetic sites",
    "num_unique_magnetic_sites": "Unique magnetic sites",
    "e_total": "Total dielectric constant",
    "e_ionic": "Ionic dielectric constant",
    "e_electronic": "Electronic dielectric constant",
    "n": "Refractive index",
    "e_ij_max": "Piezoelectric modulus (C/m²)",
    "weighted_surface_energy": "Weighted surface energy (J/m²)",
    "weighted_work_function": "Weighted work function (eV)",
    "surface_anisotropy": "Surface energy anisotropy",
    "shape_factor": "Shape factor",
}

BOOL_FIELDS = ("is_stable", "is_metal", "is_gap_direct", "theoretical", "has_reconstructed")
ORDERINGS = ("FM", "AFM", "FiM", "NM")

BASE_FIELDS = [
    "material_id", "formula_pretty", "chemsys", "nsites", "density", "density_atomic",
    "volume", "symmetry", "energy_above_hull", "formation_energy_per_atom", "is_stable",
    "theoretical",
]

# Each preset = one of the original tools: which columns to show, a default filter,
# and which range filters to surface in the UI.
PRESETS: dict[str, dict[str, Any]] = {
    "overview": {
        "label": "Overview",
        "description": "Density, atomic density and stability of materials containing the given elements.",
        "fields": ["band_gap", "is_metal"],
        "filters": ["density", "energy_above_hull", "nelements"],
        "has_props": None,
    },
    "semiconductors": {
        "label": "Semiconductors",
        "description": "Materials within a band-gap window containing the given elements.",
        "fields": ["band_gap", "is_gap_direct", "is_metal", "efermi"],
        "filters": ["band_gap", "energy_above_hull"],
        "defaults": {"band_gap_min": 0.5, "band_gap_max": 3.5},
        "has_props": None,
    },
    "elasticity": {
        "label": "Elasticity",
        "description": "Bulk and shear moduli (Voigt, Reuss, VRH), elastic anisotropy and Poisson's ratio.",
        "fields": ["bulk_modulus", "shear_modulus", "universal_anisotropy", "homogeneous_poisson"],
        "filters": ["k_vrh", "g_vrh", "universal_anisotropy", "homogeneous_poisson"],
        "has_props": "elasticity",
    },
    "magnetism": {
        "label": "Magnetic properties",
        "description": "Magnetic ordering, total magnetization and number of magnetic sites.",
        "fields": [
            "ordering", "is_magnetic", "total_magnetization",
            "total_magnetization_normalized_vol", "total_magnetization_normalized_formula_units",
            "num_magnetic_sites", "num_unique_magnetic_sites", "types_of_magnetic_species",
        ],
        "filters": ["total_magnetization", "num_magnetic_sites", "num_unique_magnetic_sites"],
        "has_props": "magnetism",
    },
    "dielectric": {
        "label": "Dielectric properties",
        "description": "Total, ionic and electronic dielectric constants and refractive index.",
        "fields": ["e_total", "e_ionic", "e_electronic", "n", "band_gap"],
        "filters": ["e_total", "e_ionic", "e_electronic", "n"],
        "has_props": "dielectric",
    },
    "piezoelectric": {
        "label": "Piezoelectric properties",
        "description": "Maximum piezoelectric modulus of non-centrosymmetric materials.",
        "fields": ["e_ij_max", "band_gap"],
        "filters": ["e_ij_max"],
        "has_props": "piezoelectric",
    },
    "surfaces": {
        "label": "Surface properties",
        "description": "Weighted surface energy, work function, anisotropy, shape factor, reconstruction.",
        "fields": [
            "weighted_surface_energy", "weighted_work_function", "surface_anisotropy",
            "shape_factor", "has_reconstructed",
        ],
        "filters": ["weighted_surface_energy", "weighted_work_function", "surface_anisotropy", "shape_factor"],
        "has_props": "surface_properties",
    },
}

ELEMENT_RE = re.compile(r"^[A-Z][a-z]?$")


def _split_elements(raw: str | None) -> list[str]:
    if not raw:
        return []
    items = [e.strip() for e in re.split(r"[,\s]+", raw) if e.strip()]
    items = [e[0].upper() + e[1:].lower() for e in items]
    bad = [e for e in items if not ELEMENT_RE.match(e)]
    if bad:
        raise HTTPException(422, f"Not valid element symbols: {', '.join(bad)}")
    return items


async def _mp_get(request: Request, path: str, params: dict[str, Any]) -> dict:
    settings = get_settings()
    if not settings.mp_api_key:
        raise HTTPException(
            503,
            "Materials Project API key is not configured. Set MP_API_KEY in backend/.env "
            "(free key: https://next-gen.materialsproject.org/api).",
        )
    client: httpx.AsyncClient = request.app.state.http
    try:
        resp = await client.get(
            f"{settings.mp_api_url}{path}",
            params=params,
            headers={"x-api-key": settings.mp_api_key},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach Materials Project: {exc}") from exc
    if resp.status_code in (401, 403):
        raise HTTPException(502, "Materials Project rejected the API key. Check MP_API_KEY.")
    if resp.status_code >= 400:
        detail = resp.json().get("detail", resp.text) if resp.headers.get("content-type", "").startswith("application/json") else resp.text
        raise HTTPException(502, f"Materials Project error {resp.status_code}: {detail}")
    return resp.json()


def _flatten(doc: dict) -> dict:
    """Flatten nested MP structures into table-friendly scalars."""
    out = dict(doc)
    sym = out.pop("symmetry", None) or {}
    out["crystal_system"] = sym.get("crystal_system")
    out["spacegroup"] = sym.get("symbol")
    for key, prefix in (("bulk_modulus", "k"), ("shear_modulus", "g")):
        moduli = out.pop(key, None) or {}
        for avg in ("voigt", "reuss", "vrh"):
            out[f"{prefix}_{avg}"] = moduli.get(avg)
    if isinstance(out.get("types_of_magnetic_species"), list):
        out["types_of_magnetic_species"] = " ".join(out["types_of_magnetic_species"])
    return out


@router.get("/presets")
def presets() -> dict:
    return {
        "presets": {k: {kk: vv for kk, vv in v.items() if kk != "has_props"} for k, v in PRESETS.items()},
        "range_fields": RANGE_FIELDS,
        "orderings": ORDERINGS,
    }


@router.get("/search")
async def search(
    request: Request,
    preset: str = "overview",
    elements: Annotated[str | None, Query(description="Must contain all, e.g. 'Fe O'")] = None,
    exclude_elements: str | None = None,
    formula: str | None = None,
    is_stable: bool | None = None,
    is_metal: bool | None = None,
    ordering: str | None = None,
    sort: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    skip: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    if preset not in PRESETS:
        raise HTTPException(422, f"Unknown preset '{preset}'. Choose one of: {', '.join(PRESETS)}")
    cfg = PRESETS[preset]

    params: dict[str, Any] = {
        "_fields": ",".join(BASE_FIELDS + cfg["fields"]),
        "_limit": limit,
        "_skip": skip,
    }
    if cfg["has_props"]:
        params["has_props"] = cfg["has_props"]
    if els := _split_elements(elements):
        params["elements"] = ",".join(els)
    if ex := _split_elements(exclude_elements):
        params["exclude_elements"] = ",".join(ex)
    if formula:
        params["formula"] = formula.strip()
    if is_stable is not None:
        params["is_stable"] = is_stable
    if is_metal is not None:
        params["is_metal"] = is_metal
    if ordering:
        if ordering not in ORDERINGS:
            raise HTTPException(422, f"ordering must be one of {ORDERINGS}")
        params["ordering"] = ordering

    # Pass through any `<field>_min` / `<field>_max` query params we recognise.
    for key, value in request.query_params.items():
        field, _, bound = key.rpartition("_")
        if bound in ("min", "max") and field in RANGE_FIELDS and value != "":
            try:
                params[key] = float(value)
            except ValueError:
                raise HTTPException(422, f"{key} must be a number") from None

    if sort:
        if sort.lstrip("-") not in set(BASE_FIELDS + cfg["fields"]) | set(RANGE_FIELDS):
            raise HTTPException(422, f"Cannot sort by '{sort}'")
        params["_sort_fields"] = sort

    data = await _mp_get(request, "/materials/summary/", params)
    return {
        "total": data.get("meta", {}).get("total_doc", len(data.get("data", []))),
        "results": [_flatten(d) for d in data.get("data", [])],
    }


@router.get("/{material_id}")
async def material(request: Request, material_id: str) -> dict:
    if not re.fullmatch(r"(mp|mvc)-\d+", material_id):
        raise HTTPException(422, "Material ids look like 'mp-149'")
    data = await _mp_get(
        request,
        "/materials/summary/",
        {"material_ids": material_id, "_all_fields": True, "_limit": 1},
    )
    docs = data.get("data", [])
    if not docs:
        raise HTTPException(404, f"{material_id} not found")
    doc = docs[0]
    doc.pop("structure", None)  # large; not needed by the UI
    return _flatten(doc)
