"""End-to-end smoke test of a deployed (or local) SMSE AI Toolkit.

    pip install -r e2e/requirements.txt && python -m playwright install chromium
    python e2e/smoke.py https://smse-toolkit-website.vercel.app          # everything
    python e2e/smoke.py http://localhost:3000 --no-mp                    # skip Materials Project checks

Exits non-zero if any check fails or a page logs a console error. Screenshots go to e2e/out/.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("base", nargs="?", default="https://smse-toolkit-website.vercel.app")
ap.add_argument("--no-mp", action="store_true", help="skip checks that need MP_API_KEY on the server")
args = ap.parse_args()
BASE = args.base.rstrip("/")
OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
results: list[tuple[bool, str]] = []
errors: list[str] = []


def check(name, fn, mp=False):
    if mp and args.no_mp:
        return
    t0 = time.time()
    try:
        detail = fn() or ""
        results.append((True, f"PASS  {name:<32} {time.time() - t0:5.1f}s  {detail}"))
    except Exception as e:  # noqa: BLE001
        results.append((False, f"FAIL  {name:<32} {time.time() - t0:5.1f}s  {str(e).splitlines()[0][:170]}"))


def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "smse-e2e"})
    with urllib.request.urlopen(req, timeout=90) as r:  # noqa: S310 — our own URL
        return r.status, r.headers, json.loads(r.read())


# --- API (no browser) -----------------------------------------------------------------
def api_presets():
    status, h, body = get("/api/materials/presets")
    assert status == 200 and body, "no presets"
    assert "s-maxage" in (h.get("Cache-Control") or ""), f"Cache-Control: {h.get('Cache-Control')}"
    return f"Cache-Control: {h['Cache-Control']}"


def api_material():
    status, h, body = get("/api/materials/mp-149")
    assert status == 200 and body.get("formula_pretty") == "Si", str(body)[:100]
    assert "s-maxage" in (h.get("Cache-Control") or "")
    return f"Si; X-RateLimit-Limit: {h.get('X-RateLimit-Limit') or '(CDN hit)'}"


def api_error_not_cached():
    try:
        get("/api/phase?elements=Qq-Zz")
    except urllib.error.HTTPError as e:
        assert e.code == 422, e.code
        assert "s-maxage" not in (e.headers.get("Cache-Control") or "")
        return "422, not cached"
    raise AssertionError("expected HTTP 422")


check("API presets + cache header", api_presets)
check("API material + headers", api_material, mp=True)
check("API error not cached", api_error_not_cached)

# --- Browser ----------------------------------------------------------------------------
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(f"{page.url}: {m.text[:200]}"))
    page.on("pageerror", lambda e: errors.append(f"{page.url}: {str(e)[:200]}"))

    paths = ["/", "/micrograph", "/image-analysis", "/steel", "/periodic-table", "/citations"]
    if not args.no_mp:
        paths += ["/materials", "/phase-diagram", "/electrodes"]
    for path in paths:
        def load(path=path):
            r = page.goto(BASE + path)
            assert r and r.status == 200, f"HTTP {r and r.status}"
            return "HTTP 200"

        check(f"page {path}", load)

    def micrograph():
        page.goto(BASE + "/micrograph")
        out = []
        for s in ["Nanowires", "Porous Sponge", "Tips"]:
            page.click(f"button:has-text('{s}')")
            page.wait_for_function(
                f"document.querySelector('p.text-2xl')?.innerText === '{s}'"
                " && document.body.innerText.includes('confidence')",
                timeout=90000,
            )
            conf = re.search(r"([\d.]+)% confidence", page.inner_text("body")).group(1)
            out.append(f"{s} {conf}%")
        page.screenshot(path=OUT / "micrograph.png", full_page=True)
        return ", ".join(out)

    check("micrograph: in-browser model", micrograph)

    def steel():
        page.goto(BASE + "/steel")
        page.wait_for_selector("text=model spread", timeout=30000)
        before = page.locator("p.text-2xl").all_inner_texts()[:4]
        page.locator("#temp").fill("500")
        page.wait_for_timeout(400)
        after = page.locator("p.text-2xl").all_inner_texts()[:4]
        assert before != after, "prediction did not react to temperature"
        return f"27°C {before} -> 500°C {after}"

    check("steel: prediction reacts", steel)

    def analysis():
        page.goto(BASE + "/image-analysis")
        page.click("button:has-text('SEM porous sponge')")
        page.wait_for_selector("text=Results", timeout=30000)
        return page.locator("dl").first.inner_text().replace("\n", " ")[:100]

    check("image analysis: porosity", analysis)

    def materials():
        page.goto(BASE + "/materials")
        page.fill("#elements", "Ga N")
        page.click("button:has-text('Search')")
        page.wait_for_selector("table tbody tr", timeout=60000)
        return f"{page.locator('table tbody tr').count()} rows"

    check("materials: search Ga-N", materials, mp=True)

    def material_page():
        page.goto(BASE + "/materials/mp-aaaabhik")  # LiCoO2
        page.wait_for_selector("text=Oxidation states", timeout=60000)
        page.wait_for_selector("text=Simulated XRD pattern", timeout=60000)
        page.wait_for_selector("svg[aria-label='Band structure and density of states'] path", timeout=90000)
        page.wait_for_timeout(1500)
        with page.expect_download(timeout=60000) as dl:
            page.click("button:has-text('PDF report')")
        size = Path(dl.value.path()).stat().st_size
        assert size > 50_000, f"PDF only {size} bytes"
        page.screenshot(path=OUT / "licoo2.png", full_page=True)
        return f"XRD + bands + oxidation, PDF {size // 1024} KB"

    check("material page + PDF (LiCoO2)", material_page, mp=True)

    def phase():
        page.goto(BASE + "/phase-diagram")
        page.wait_for_selector("text=Stable compounds", timeout=60000)
        page.click("button:has-text('Li–Co–O')")
        page.wait_for_selector("svg[aria-label='Li–Co–O ternary phase diagram']", timeout=90000)
        return "ternary Li–Co–O drawn"

    check("phase diagram: ternary", phase, mp=True)

    def citations():
        page.goto(BASE + "/citations")
        page.fill("input[aria-label=DOI]", "10.1038/sdata.2018.172")
        page.click("button:has-text('Generate')")
        page.wait_for_function("document.body.innerText.includes('Aversa')", timeout=60000)
        return "DOI resolved"

    check("citations: DOI", citations)

    def mobile():
        m = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark")
        mp = m.new_page()
        mp.goto(BASE + "/")
        wide = mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        m.close()
        assert not wide, "page scrolls horizontally on mobile"
        return "no horizontal overflow"

    check("mobile layout (dark)", mobile)
    b.close()

print("\n".join(line for _, line in results))
print("\nconsole errors:", "\n  ".join(errors) if errors else "none")
sys.exit(0 if all(ok for ok, _ in results) and not errors else 1)
