import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { NewsFeed, NewsFeedSkeleton } from "@/components/news-feed";
import { TOOLS } from "@/lib/tools";

const TEAM = ["Peeyush Mishra", "Kaushlendra Kumar", "Pawe Dhananjay Manohar", "Sushil Kumar Kumhar"];

const UPGRADES = [
  {
    area: "Micrograph recognition",
    then: "Keras CNN trained from scratch on ~1,500 images, 4 classes",
    now: "Transfer-learned ImageNet backbone on the full 18,500-image NFFA-EUROPE set, 10 classes, served via ONNX",
  },
  {
    area: "Steel properties",
    then: "Multiple linear regression, random 80:20 split",
    now: "Extra-Trees ensembles with per-prediction uncertainty, validated on unseen alloys (GroupKFold)",
  },
  {
    area: "Database lookup",
    then: "12 command-line scripts with input() prompts",
    now: "One searchable explorer over the Materials Project REST API",
  },
  {
    area: "Citations",
    then: "Hand-written style rules (citeproc-py / pybtex)",
    now: "DOI & free-text lookup, formatted by the citeproc-js engine with official CSL styles",
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="lattice -mx-4 rounded-2xl border border-line px-6 py-14 sm:mx-0 sm:px-12">
        <p className="text-sm font-medium text-accent">School of Materials Science and Engineering · NIT Calicut</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          AI tools for everyday materials research.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Classify SEM micrographs, predict the mechanical properties of steels, search the Materials Project database and
          format references — in one place, free and open source.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/micrograph"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:brightness-110"
          >
            Classify a micrograph <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/steel"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
          >
            Predict steel properties
          </Link>
        </div>
      </section>

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-5 text-xl font-semibold tracking-tight">
          Tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex flex-col rounded-xl border border-line bg-surface p-5 transition hover:border-accent/60 hover:shadow-sm"
            >
              <t.icon className="size-6 text-accent" aria-hidden />
              <h3 className="mt-4 font-semibold">{t.name}</h3>
              <p className="mt-1.5 flex-1 text-sm text-muted">{t.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="news-heading">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="news-heading" className="text-xl font-semibold tracking-tight">
            Latest in materials science
          </h2>
          <span className="text-xs text-muted">Nature Materials · ScienceDaily · Phys.org — updated hourly</span>
        </div>
        <Suspense fallback={<NewsFeedSkeleton />}>
          <NewsFeed />
        </Suspense>
      </section>

      <section aria-labelledby="history-heading" className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 id="history-heading" className="text-xl font-semibold tracking-tight">
            From a 2023 thesis to v2
          </h2>
          <p className="mt-3 text-sm text-muted">
            The toolkit began as the B.Tech project <em>“SMSE AI Toolkit: Material Class and Properties Prediction”</em>{" "}
            (May 2023), guided by Dr. Devendra K. Yadav. Version 2 rebuilds every tool on a modern stack — Next.js,
            FastAPI, PyTorch and scikit-learn — with stricter validation.
          </p>
          <p className="mt-4 text-sm font-medium">Original authors</p>
          <ul className="mt-1 text-sm text-muted">
            {TEAM.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tool</th>
                <th className="px-4 py-3 font-medium">2023</th>
                <th className="px-4 py-3 font-medium">v2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {UPGRADES.map((u) => (
                <tr key={u.area} className="align-top">
                  <td className="px-4 py-3 font-medium">{u.area}</td>
                  <td className="px-4 py-3 text-muted">{u.then}</td>
                  <td className="px-4 py-3">{u.now}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
