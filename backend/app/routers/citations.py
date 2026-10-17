"""Citation metadata lookup.

The backend resolves a DOI (or free-text reference) to CSL-JSON metadata;
the frontend formats it into IEEE / APA / MLA / Chicago / Harvard / Turabian /
Vancouver with citation-js (the citeproc-js engine also used by Zotero).
"""

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import get_settings

router = APIRouter(prefix="/api/citations", tags=["citations"])

DOI_RE = re.compile(r"10\.\d{4,9}/\S+", re.IGNORECASE)


class CitationRequest(BaseModel):
    doi: str = Field(description="A DOI or DOI URL, e.g. 10.1063/1.4812323")


def normalize_doi(raw: str) -> str:
    match = DOI_RE.search(raw.strip())
    if not match:
        raise HTTPException(422, "That doesn't look like a DOI (expected something like 10.1063/1.4812323).")
    return match.group(0).rstrip(".,;")


def clean_csl(value: Any) -> Any:
    """Drop empty strings/lists/dicts and name entries with no name parts (they render as 'edited by ,')."""
    if isinstance(value, dict):
        out = {k: clean_csl(v) for k, v in value.items()}
        return {k: v for k, v in out.items() if v not in ("", [], {}, None)}
    if isinstance(value, list):
        out = [clean_csl(v) for v in value]
        out = [v for v in out if v not in ("", [], {}, None)]
        return [v for v in out if not (isinstance(v, dict) and set(v) <= {"sequence", "affiliation"})]
    return value


async def _negotiate(client: httpx.AsyncClient, doi: str, accept: str) -> str:
    try:
        resp = await client.get(f"https://doi.org/{doi}", headers={"Accept": accept})
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach doi.org: {exc}") from exc
    if resp.status_code == 404:
        raise HTTPException(404, f"DOI {doi} was not found.")
    if resp.status_code >= 400:
        raise HTTPException(502, f"doi.org returned {resp.status_code}")
    resp.encoding = "utf-8"
    return resp.text.strip()


@router.post("")
async def resolve(body: CitationRequest, request: Request) -> dict:
    doi = normalize_doi(body.doi)
    client: httpx.AsyncClient = request.app.state.http
    csl = clean_csl(json.loads(await _negotiate(client, doi, "application/vnd.citationstyles.csl+json")))
    for key in ("reference", "relation", "license", "link", "funder", "assertion", "content-domain"):
        csl.pop(key, None)  # bulky Crossref extras, irrelevant for formatting
    csl["id"] = doi
    try:
        bibtex = await _negotiate(client, doi, "application/x-bibtex")
    except HTTPException:
        bibtex = None
    return {"doi": doi, "csl": csl, "bibtex": bibtex}


@router.get("/search")
async def search(request: Request, q: str = Query(min_length=3), rows: int = Query(5, ge=1, le=20)) -> dict:
    """Find DOIs from a free-text reference or title via Crossref."""
    settings = get_settings()
    params = {"query.bibliographic": q, "rows": rows, "select": "DOI,title,author,issued,container-title"}
    if settings.crossref_mailto:
        params["mailto"] = settings.crossref_mailto
    client: httpx.AsyncClient = request.app.state.http
    try:
        resp = await client.get("https://api.crossref.org/works", params=params)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Crossref search failed: {exc}") from exc
    items = resp.json()["message"]["items"]
    return {
        "results": [
            {
                "doi": it["DOI"],
                "title": (it.get("title") or [""])[0],
                "container": (it.get("container-title") or [""])[0],
                "year": ((it.get("issued", {}).get("date-parts") or [[None]])[0] or [None])[0],
                "authors": [
                    " ".join(filter(None, [a.get("given"), a.get("family")])) for a in it.get("author", [])[:4]
                ],
            }
            for it in items
        ]
    }
