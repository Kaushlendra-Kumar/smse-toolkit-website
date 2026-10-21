import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.routers.citations import clean_csl, normalize_doi
from app.routers.materials import _flatten, _split_elements


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.skipif(not (get_settings().models_dir / "steel.joblib").exists(), reason="steel model not trained")
def test_steel_predict(client):
    schema = client.get("/api/steel/schema").json()
    comp = {f: r["median"] for f, r in schema["feature_ranges"].items() if f != "Temperature (°C)"}
    r = client.post("/api/steel/predict", json={"composition": comp, "temperature": 27})
    assert r.status_code == 200
    body = r.json()
    p = body["predictions"]
    assert set(p) == {"proof_stress", "tensile_strength", "elongation", "reduction_in_area"}
    assert 100 < p["proof_stress"]["value"] < p["tensile_strength"]["value"] < 1200
    assert len(body["curve"]["temperature"]) == len(body["curve"]["tensile_strength"]["mean"])
    assert body["warnings"] == []


@pytest.mark.skipif(not (get_settings().models_dir / "steel.joblib").exists(), reason="steel model not trained")
def test_steel_extrapolation_warning_and_unknown_feature(client):
    r = client.post("/api/steel/predict", json={"composition": {"C": 1.5}, "temperature": 27})
    assert any("C = 1.5" in w for w in r.json()["warnings"])
    assert client.post("/api/steel/predict", json={"composition": {"Xx": 1}}).status_code == 422


def test_split_elements():
    assert _split_elements("fe, O  si") == ["Fe", "O", "Si"]
    with pytest.raises(HTTPException):
        _split_elements("Fe Qqq")


def test_flatten_moduli():
    out = _flatten({"bulk_modulus": {"vrh": 100, "voigt": 110, "reuss": 90}, "symmetry": {"crystal_system": "Cubic", "symbol": "Fm-3m"}})
    assert out["k_vrh"] == 100 and out["k_voigt"] == 110 and out["crystal_system"] == "Cubic"


def test_normalize_doi():
    assert normalize_doi("https://doi.org/10.1063/1.4812323") == "10.1063/1.4812323"
    assert normalize_doi("doi: 10.1016/j.commatsci.2021.110328.") == "10.1016/j.commatsci.2021.110328"
    with pytest.raises(HTTPException):
        normalize_doi("not a doi")


def test_clean_csl_drops_empty_editors():
    raw = {"title": "T", "editor": [{"sequence": "first", "affiliation": []}], "author": [{"family": "Jain", "given": "A"}], "page": ""}
    assert clean_csl(raw) == {"title": "T", "author": [{"family": "Jain", "given": "A"}]}


def test_strip_info_bar():
    import numpy as np
    from PIL import Image

    from app.imaging import strip_info_bar

    rng = np.random.default_rng(0)
    a = rng.integers(40, 160, size=(300, 400), dtype=np.uint8)  # textured "micrograph"
    a[250:290] = 245  # bright data panel
    a[290:] = 70  # dark strip below it
    out = strip_info_bar(Image.fromarray(a))
    assert 240 <= out.height <= 250 and out.width == 400
    # Panel with text rows and more image content below it (the case the old rule missed)
    b = rng.integers(40, 160, size=(300, 400), dtype=np.uint8)
    b[250:275] = 245
    b[258:262, 20:200] = 10  # a line of panel text
    b[280:] = rng.integers(60, 230, size=(20, 400))  # bright-ish content below the panel
    assert 240 <= strip_info_bar(Image.fromarray(b)).height <= 250
    # Bright specimen gradually filling the bottom (no sharp edge): not a panel
    c = np.tile(np.linspace(80, 235, 300, dtype=np.float32)[:, None], (1, 400)).astype(np.uint8)
    assert strip_info_bar(Image.fromarray(c)).size == (400, 300)
    # No panel: unchanged unless a fallback is requested
    plain = Image.fromarray(rng.integers(40, 160, size=(300, 400), dtype=np.uint8))
    assert strip_info_bar(plain).size == (400, 300)
    assert strip_info_bar(plain, fallback=0.8).height == 238


def test_materials_rejects_bad_preset(client):
    assert client.get("/api/materials/search", params={"preset": "nope"}).status_code == 422
