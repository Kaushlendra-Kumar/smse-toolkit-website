import "server-only";

import { HttpError } from "./materials";

/** DOI → CSL-JSON (+ BibTeX) and Crossref free-text search. Port of backend/app/routers/citations.py. */

const DOI = /10\.\d{4,9}\/\S+/i;

export function normalizeDoi(raw: string): string {
  const m = DOI.exec(raw.trim());
  if (!m) throw new HttpError(422, "That doesn't look like a DOI (expected something like 10.1063/1.4812323).");
  return m[0].replace(/[.,;]+$/, "");
}

/** Drop empty values and name entries with no name parts (they render as "edited by ,"). */
export function cleanCsl(value: unknown): unknown {
  const empty = (v: unknown) =>
    v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length) ||
    (typeof v === "object" && v !== null && !Array.isArray(v) && !Object.keys(v).length);
  if (Array.isArray(value)) {
    return value
      .map(cleanCsl)
      .filter((v) => !empty(v))
      .filter((v) => !(typeof v === "object" && v !== null && Object.keys(v).every((k) => k === "sequence" || k === "affiliation")));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, cleanCsl(v)] as const)
        .filter(([, v]) => !empty(v)),
    );
  }
  return value;
}

async function negotiate(doi: string, accept: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://doi.org/${doi}`, { headers: { Accept: accept }, redirect: "follow", cache: "no-store" });
  } catch (e) {
    throw new HttpError(502, `Could not reach doi.org: ${(e as Error).message}`);
  }
  if (res.status === 404) throw new HttpError(404, `DOI ${doi} was not found.`);
  if (!res.ok) throw new HttpError(502, `doi.org returned ${res.status}`);
  return (await res.text()).trim();
}

export async function resolveDoi(raw: string) {
  const doi = normalizeDoi(raw);
  const csl = cleanCsl(JSON.parse(await negotiate(doi, "application/vnd.citationstyles.csl+json"))) as Record<string, unknown>;
  for (const k of ["reference", "relation", "license", "link", "funder", "assertion", "content-domain"]) delete csl[k];
  csl.id = doi;
  let bibtex: string | null = null;
  try {
    bibtex = await negotiate(doi, "application/x-bibtex");
  } catch {}
  return { doi, csl, bibtex };
}

type CrossrefItem = {
  DOI: string;
  title?: string[];
  "container-title"?: string[];
  issued?: { "date-parts"?: (number | null)[][] };
  author?: { given?: string; family?: string }[];
};

export async function searchCrossref(q: string, rows = 5) {
  if (q.trim().length < 3) throw new HttpError(422, "Search text must be at least 3 characters.");
  const params = new URLSearchParams({
    "query.bibliographic": q,
    rows: String(Math.min(20, Math.max(1, rows))),
    select: "DOI,title,author,issued,container-title",
  });
  if (process.env.CROSSREF_MAILTO) params.set("mailto", process.env.CROSSREF_MAILTO);
  let res: Response;
  try {
    res = await fetch(`https://api.crossref.org/works?${params}`, { cache: "no-store" });
  } catch (e) {
    throw new HttpError(502, `Crossref search failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new HttpError(502, `Crossref search failed (${res.status})`);
  const items: CrossrefItem[] = (await res.json()).message.items;
  return {
    results: items.map((it) => ({
      doi: it.DOI,
      title: it.title?.[0] ?? "",
      container: it["container-title"]?.[0] ?? "",
      year: it.issued?.["date-parts"]?.[0]?.[0] ?? null,
      authors: (it.author ?? []).slice(0, 4).map((a) => [a.given, a.family].filter(Boolean).join(" ")),
    })),
  };
}
