"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { FermiData } from "@/components/fermi-viewer";
import { Button, Card, CardTitle } from "@/components/ui";
import { apiGet } from "@/lib/api";

const FermiViewer = dynamic(() => import("@/components/fermi-viewer").then((m) => m.FermiViewer), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-lg bg-surface-2" />,
});

type Response = ({ metal: true } & FermiData) | { metal: false };

/** Fermi surface for metals — loaded on demand (the calculation file is several MB). */
export function FermiSection({ id }: { id: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<Response>(`/materials/${encodeURIComponent(id)}/fermi`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardTitle>Fermi surface</CardTitle>
      {!data && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={load} loading={loading}>
            Compute Fermi surface
          </Button>
          <span className="text-sm text-muted">Built from the uniform DFT band structure (takes a few seconds the first time).</span>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-muted">{error}</p>}
      {data && !data.metal && <p className="text-sm text-muted">Not a metal in this calculation — no Fermi surface.</p>}
      {data?.metal && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <FermiViewer data={data} />
          <div className="space-y-2 text-sm text-muted">
            <p>
              The surface of constant energy E = E<sub>F</sub> in reciprocal space: electrons with these momenta carry current.
              Each colour is one band that crosses the Fermi level ({data.sheets.length} sheet{data.sheets.length === 1 ? "" : "s"}).
            </p>
            <p>
              Computed in your browser from a {data.n}×{data.n}×{data.n} k-point DFT calculation (Materials Project), completed
              with time-reversal symmetry E(−k) = E(k), smoothed by trilinear interpolation, and extracted with marching
              tetrahedra. Shown in the reciprocal unit cell centred on Γ (black dot) — not cut to the first Brillouin zone,
              so a sheet can appear split at the cell faces.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
