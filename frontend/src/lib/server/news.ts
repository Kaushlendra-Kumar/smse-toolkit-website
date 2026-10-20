import "server-only";

import { cacheLife } from "next/cache";

/** Materials-science headlines from public RSS feeds (the 2023 dashboard's news portal). */

export type NewsItem = { title: string; link: string; date: string | null; summary: string; source: string; kind: "Paper" | "News" };

const FEEDS = [
  { url: "https://www.nature.com/nmat.rss", source: "Nature Materials", kind: "Paper" },
  { url: "https://www.sciencedaily.com/rss/matter_energy/materials_science.xml", source: "ScienceDaily", kind: "News" },
  { url: "https://phys.org/rss-feed/nanotech-news/materials-science/", source: "Phys.org", kind: "News" },
] as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function tag(item: string, ...names: string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(item);
    if (m) return m[1];
  }
  return null;
}

export function parseFeed(xml: string, source: string, kind: NewsItem["kind"]): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((item) => {
    const title = decode(tag(item, "title", "dc:title") ?? "");
    const link = decode(tag(item, "link", "prism:url") ?? "");
    if (!title || !/^https?:\/\//.test(link)) return [];
    const rawDate = tag(item, "pubDate", "dc:date");
    const parsed = rawDate ? new Date(decode(rawDate)) : null;
    let summary = decode(tag(item, "description", "content:encoded") ?? "");
    summary = summary.replace(/^Nature Materials, Published online:[^;]*;\s*doi:\S+\s*/i, ""); // Nature's boilerplate prefix
    return [{
      title,
      link,
      date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      summary: summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}…` : summary,
      source,
      kind,
    }];
  });
}

async function fetchFeed(feed: (typeof FEEDS)[number]): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "SMSE-AI-Toolkit/2.0 (+https://smse-toolkit-website.vercel.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed.source, feed.kind);
  } catch {
    return []; // one slow or broken feed must not take the page down
  }
}

/** Latest items across all feeds, newest first; cached for an hour. */
export async function getNews(limit = 9): Promise<NewsItem[]> {
  "use cache";
  cacheLife("hours");
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  // Interleave sources so one busy feed doesn't crowd out the journal papers.
  const bySource = FEEDS.map((f) =>
    all.filter((i) => i.source === f.source).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
  );
  const mixed: NewsItem[] = [];
  for (let i = 0; mixed.length < limit && bySource.some((s) => s[i]); i++) {
    for (const s of bySource) if (s[i] && mixed.length < limit) mixed.push(s[i]);
  }
  return mixed;
}
