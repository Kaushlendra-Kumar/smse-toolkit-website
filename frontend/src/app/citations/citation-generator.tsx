"use client";

import { Check, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";

import { Button, Card, CardTitle, Input, Label, Notice, Segmented } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api";
import { formatBibliography, STYLE_LABELS, toBibtex, type CSL, type StyleLabel } from "@/lib/cite";

type Mode = "doi" | "search" | "manual";
type SearchHit = { doi: string; title: string; container: string; year: number | null; authors: string[] };

const LIST_KEY = "smse-citations-v1";
const LIST_EVENT = "smse-citations-change";

function readList(): string {
  try {
    return localStorage.getItem(LIST_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** Reference list persisted in localStorage (per browser), hydration-safe. */
function useStoredList(): [CSL[], (update: (list: CSL[]) => CSL[]) => void] {
  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(LIST_EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(LIST_EVENT, onChange);
      };
    },
    readList,
    () => "[]",
  );
  const list = useMemo<CSL[]>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);
  const update = useCallback((fn: (list: CSL[]) => CSL[]) => {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(fn(JSON.parse(readList()))));
    } catch {}
    window.dispatchEvent(new Event(LIST_EVENT));
  }, []);
  return [list, update];
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      className="shrink-0 px-2.5 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** Parse "Family, Given" (or "Given Family") lines into CSL names. */
function parseAuthors(raw: string): CSL["author"] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (l.includes(",")) {
        const [family, given] = l.split(",", 2).map((s) => s.trim());
        return { family, given };
      }
      const parts = l.split(/\s+/);
      return parts.length === 1 ? { literal: l } : { family: parts.pop()!, given: parts.join(" ") };
    });
}

function ManualForm({ onAdd }: { onAdd: (item: CSL) => void }) {
  const [f, setF] = useState({ type: "article-journal", authors: "", title: "", container: "", year: "", volume: "", issue: "", page: "", publisher: "", url: "", doi: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const item: CSL = {
      id: `manual-${Date.now()}`,
      type: f.type as CSL["type"],
      title: f.title,
      author: parseAuthors(f.authors),
      ...(f.container && { "container-title": f.container }),
      ...(f.year && { issued: { "date-parts": [[Number(f.year)]] } }),
      ...(f.volume && { volume: f.volume }),
      ...(f.issue && { issue: f.issue }),
      ...(f.page && { page: f.page }),
      ...(f.publisher && { publisher: f.publisher }),
      ...(f.url && { URL: f.url }),
      ...(f.doi && { DOI: f.doi }),
    };
    onAdd(item);
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="m-type">Type</Label>
        <select id="m-type" value={f.type} onChange={set("type")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <option value="article-journal">Journal article</option>
          <option value="book">Book</option>
          <option value="chapter">Book chapter</option>
          <option value="paper-conference">Conference paper</option>
          <option value="thesis">Thesis</option>
          <option value="webpage">Web page</option>
          <option value="dataset">Dataset</option>
        </select>
      </div>
      <div>
        <Label htmlFor="m-year">Year</Label>
        <Input id="m-year" inputMode="numeric" value={f.year} onChange={set("year")} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="m-title">Title</Label>
        <Input id="m-title" required value={f.title} onChange={set("title")} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="m-authors" hint="one per line: Family, Given">
          Authors
        </Label>
        <textarea
          id="m-authors"
          rows={3}
          value={f.authors}
          onChange={set("authors")}
          placeholder={"Jain, Anubhav\nOng, Shyue Ping"}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="m-container">Journal / book / website</Label>
        <Input id="m-container" value={f.container} onChange={set("container")} />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <div>
          <Label htmlFor="m-vol">Volume</Label>
          <Input id="m-vol" value={f.volume} onChange={set("volume")} />
        </div>
        <div>
          <Label htmlFor="m-issue">Issue</Label>
          <Input id="m-issue" value={f.issue} onChange={set("issue")} />
        </div>
        <div>
          <Label htmlFor="m-page">Pages</Label>
          <Input id="m-page" value={f.page} onChange={set("page")} />
        </div>
      </div>
      <div>
        <Label htmlFor="m-pub">Publisher</Label>
        <Input id="m-pub" value={f.publisher} onChange={set("publisher")} />
      </div>
      <div>
        <Label htmlFor="m-doi">DOI</Label>
        <Input id="m-doi" value={f.doi} onChange={set("doi")} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="m-url">URL</Label>
        <Input id="m-url" type="url" value={f.url} onChange={set("url")} />
      </div>
      <div>
        <Button type="submit">
          <Plus className="size-4" aria-hidden /> Add reference
        </Button>
      </div>
    </form>
  );
}

export function CitationGenerator() {
  const [mode, setMode] = useState<Mode>("doi");
  const [doi, setDoi] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [current, setCurrent] = useState<CSL | null>(null);
  const [rendered, setRendered] = useState<Partial<Record<StyleLabel, string>>>({});
  const [list, setList] = useStoredList();
  const [listStyle, setListStyle] = useState<StyleLabel>("IEEE");
  const [listText, setListText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!list.length) return;
    formatBibliography(list, listStyle)
      .then(setListText)
      .catch((e) => setError(e.message));
  }, [list, listStyle]);

  // Render the current reference in every style.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    Promise.all(STYLE_LABELS.map(async (s) => [s, await formatBibliography([current], s).catch(() => "")] as const)).then((entries) => {
      if (!cancelled) setRendered(Object.fromEntries(entries.filter(([, t]) => t)));
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

  const resolve = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiPost<{ csl: CSL }>("/citations", { doi: value });
      setRendered({});
      setCurrent(r.csl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setHits((await apiGet<{ results: SearchHit[] }>("/citations/search", { q: query })).results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addToList = (item: CSL) => setList((l) => (l.some((x) => x.id === item.id) ? l : [...l, item]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="min-w-0 space-y-6">
        <Segmented
          label="Input method"
          value={mode}
          onChange={setMode}
          options={[
            { value: "doi", label: "DOI" },
            { value: "search", label: "Search by title" },
            { value: "manual", label: "Manual entry" },
          ]}
        />

        <Card>
          {mode === "doi" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resolve(doi);
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <Input aria-label="DOI" placeholder="10.1063/1.4812323 or https://doi.org/…" value={doi} onChange={(e) => setDoi(e.target.value)} required />
              <Button type="submit" loading={loading}>
                Generate
              </Button>
            </form>
          )}
          {mode === "search" && (
            <>
              <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-label="Reference or title"
                  placeholder="Paste a messy reference or a paper title"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  minLength={3}
                  required
                />
                <Button type="submit" loading={loading}>
                  <Search className="size-4" aria-hidden /> Search
                </Button>
              </form>
              {hits && (
                <ul className="mt-4 divide-y divide-line">
                  {hits.length === 0 && <li className="py-3 text-sm text-muted">No matches on Crossref.</li>}
                  {hits.map((h) => (
                    <li key={h.doi} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{h.title}</p>
                        <p className="text-muted">
                          {h.authors.join(", ")}
                          {h.authors.length >= 4 && " et al."} · {h.container} {h.year && `(${h.year})`}
                        </p>
                      </div>
                      <Button variant="ghost" className="shrink-0 px-3 py-1" onClick={() => resolve(h.doi)}>
                        Cite
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {mode === "manual" && (
            <ManualForm
              onAdd={(item) => {
                setCurrent(item);
                addToList(item);
              }}
            />
          )}
        </Card>

        {error && <Notice>{error}</Notice>}

        {current && (
          <Card>
            <CardTitle
              aside={
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => addToList(current)}>
                  <Plus className="size-3.5" aria-hidden /> Add to reference list
                </Button>
              }
            >
              Formatted citation
            </CardTitle>
            <ul className="space-y-4">
              {STYLE_LABELS.filter((s) => rendered[s]).map((s) => (
                <li key={s}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">{s}</span>
                    <CopyButton text={rendered[s]!.trim()} />
                  </div>
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed">{rendered[s]}</p>
                </li>
              ))}
              <li>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">BibTeX</span>
                  <CopyButton text={toBibtex([current])} />
                </div>
                <pre className="overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{toBibtex([current])}</pre>
              </li>
            </ul>
          </Card>
        )}
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardTitle aside={list.length > 0 && <CopyButton text={listText} label="Copy all" />}>Reference list ({list.length})</CardTitle>
        <select
          aria-label="Reference list style"
          value={listStyle}
          onChange={(e) => setListStyle(e.target.value as StyleLabel)}
          className="mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          {STYLE_LABELS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Add references to build a bibliography you can copy in one go. Saved in this browser.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {list.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="line-clamp-2">{String(item.title ?? item.id)}</span>
                  <button
                    aria-label={`Remove ${item.title}`}
                    onClick={() => setList((l) => l.filter((x) => x.id !== item.id))}
                    className="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed">{listText}</pre>
          </>
        )}
      </Card>
    </div>
  );
}
