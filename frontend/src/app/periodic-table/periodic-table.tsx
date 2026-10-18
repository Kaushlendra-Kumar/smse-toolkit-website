"use client";

import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui";
import ELEMENTS from "@/lib/elements.json";

type Element = (typeof ELEMENTS)[number];

const CATEGORY_COLORS: Record<string, string> = {
  "alkali metal": "#e8590c",
  "alkaline earth metal": "#f59f00",
  "transition metal": "#1c7ed6",
  "post-transition metal": "#0ca678",
  metalloid: "#74b816",
  nonmetal: "#e64980",
  "noble gas": "#7048e8",
  lanthanide: "#0b7285",
  actinide: "#9c36b5",
  unknown: "#868e96",
};

const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? "—" : `${+v.toFixed(3)} ${unit}`);

export function PeriodicTable() {
  const [selected, setSelected] = useState<Element>(ELEMENTS[25]); // Fe
  const [hoverCat, setHoverCat] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-208 gap-1"
          style={{ gridTemplateColumns: "repeat(18, minmax(0, 1fr))", gridTemplateRows: "repeat(10, auto)" }}
        >
          {ELEMENTS.map((el) => {
            const color = CATEGORY_COLORS[el.cat];
            const dim = hoverCat && hoverCat !== el.cat;
            return (
              <button
                key={el.n}
                onClick={() => setSelected(el)}
                aria-label={`${el.name}, ${el.n}`}
                aria-pressed={selected.n === el.n}
                style={{
                  gridColumn: el.x,
                  gridRow: el.y,
                  borderColor: color,
                  background: `color-mix(in oklab, ${color} ${selected.n === el.n ? 35 : 12}%, var(--surface))`,
                }}
                className={clsx(
                  "flex aspect-square flex-col items-center justify-center rounded-md border-l-[3px] p-0.5 text-center transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent",
                  dim && "opacity-25",
                  el.y >= 9 && "mt-2",
                )}
              >
                <span className="self-start pl-0.5 text-[0.6rem] leading-none text-muted">{el.n}</span>
                <span className="text-base font-semibold leading-tight">{el.s}</span>
                <span className="hidden w-full truncate text-[0.55rem] leading-tight text-muted lg:block">{el.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Element categories">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <li key={cat} onMouseEnter={() => setHoverCat(cat)} onMouseLeave={() => setHoverCat(null)} className="flex cursor-default items-center gap-1.5 capitalize">
            <span className="size-3 rounded-sm" style={{ background: color }} aria-hidden />
            {cat}
          </li>
        ))}
      </ul>

      <Card className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div
          className="flex size-32 flex-col items-center justify-center rounded-xl border-l-4"
          style={{ borderColor: CATEGORY_COLORS[selected.cat], background: `color-mix(in oklab, ${CATEGORY_COLORS[selected.cat]} 15%, var(--surface))` }}
        >
          <span className="text-sm text-muted">{selected.n}</span>
          <span className="text-5xl font-semibold">{selected.s}</span>
          <span className="text-xs text-muted">{selected.mass}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{selected.name}</h2>
          <p className="text-sm text-muted">
            <span className="capitalize">{selected.cat}</span> · {selected.phase} at STP · {selected.block}-block
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ["Electron configuration", selected.config],
              ["Electronegativity", selected.en ?? "—"],
              ["Density", fmt(selected.density, selected.phase === "Gas" ? "g/L" : "g/cm³")],
              ["Melting point", fmt(selected.melt, "K")],
              ["Boiling point", fmt(selected.boil, "K")],
              ["Group / period", `${selected.group} / ${selected.period}`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 line-clamp-3 text-sm text-muted">{selected.summary}</p>
          <Link
            href={`/materials?elements=${selected.s}`}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Find materials containing {selected.s} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </Card>
      <p className="text-xs text-muted">
        Element data:{" "}
        <a className="underline" href="https://github.com/Bowserinator/Periodic-Table-JSON">
          Periodic-Table-JSON
        </a>{" "}
        (CC BY-SA 3.0).
      </p>
    </div>
  );
}
