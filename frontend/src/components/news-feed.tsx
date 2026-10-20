import { ExternalLink } from "lucide-react";

import { getNews } from "@/lib/server/news";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function NewsFeed() {
  const items = await getNews(9);
  if (!items.length) {
    return <p className="text-sm text-muted">News feeds are unavailable right now — please check back later.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((n) => (
        <li key={n.link}>
          <a
            href={n.link}
            target="_blank"
            rel="noreferrer"
            className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition hover:border-accent/60"
          >
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className={n.kind === "Paper" ? "font-medium text-accent" : "font-medium"}>{n.source}</span>
              {n.date && <span>· {fmt.format(new Date(n.date))}</span>}
            </span>
            <span className="mt-2 font-medium leading-snug group-hover:text-accent">
              {n.title}
              <ExternalLink className="ml-1 inline size-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
            </span>
            {n.summary && <span className="mt-1.5 line-clamp-3 text-sm text-muted">{n.summary}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function NewsFeedSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-36 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </ul>
  );
}
