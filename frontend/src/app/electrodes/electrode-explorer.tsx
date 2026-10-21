"use client";

import clsx from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useState, type FormEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button, Card, Input, Label, Notice } from "@/components/ui";
import { apiGet } from "@/lib/api";

type Electrode = {
  battery_formula: string;
  framework_formula: string;
  formula_charge: string;
  formula_discharge: string;
  average_voltage: number;
  capacity_grav: number;
  capacity_vol: number;
  energy_grav: number;
  energy_vol: number;
  max_delta_volume: number;
  stability_charge: number;
  stability_discharge: number;
  num_steps: number;
  id_charge: string;
  id_discharge: string;
  profile: { from: number; to: number; voltage: number }[];
};
type Response = { total: number; results: Electrode[] };

const IONS = ["Li", "Na", "K", "Mg", "Ca", "Zn", "Al"];
const SORTS: [string, string][] = [
  ["-energy_grav", "Specific energy (Wh/kg) ↓"],
  ["-capacity_grav", "Specific capacity (mAh/g) ↓"],
  ["-average_voltage", "Voltage ↓"],
  ["max_delta_volume", "Volume change ↑"],
  ["stability_discharge", "Stability (E above hull) ↑"],
];
const PAGE = 25;

function Profile({ e }: { e: Electrode }) {
  // Step curve: each voltage step spans its share of the capacity.
  const data = e.profile.flatMap((s) => [
    { cap: +s.from.toFixed(1), v: +s.voltage.toFixed(3) },
    { cap: +s.to.toFixed(1), v: +s.voltage.toFixed(3) },
  ]);
  return (
    <div className="grid gap-4 py-2 md:grid-cols-[1fr_16rem]">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="cap" type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" label={{ value: "Capacity (mAh/g)", position: "bottom", offset: 0, fill: "var(--muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" width={44} unit=" V" domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} V`, "voltage"]} labelFormatter={(c) => `${c} mAh/g`} />
            <Line type="linear" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Charged</dt>
        <dd>
          <Link className="text-accent hover:underline" href={`/materials/${e.id_charge}`}>
            {e.formula_charge}
          </Link>
        </dd>
        <dt className="text-muted">Discharged</dt>
        <dd>
          <Link className="text-accent hover:underline" href={`/materials/${e.id_discharge}`}>
            {e.formula_discharge}
          </Link>
        </dd>
        <dt className="text-muted">Voltage steps</dt>
        <dd className="font-mono">{e.num_steps}</dd>
        <dt className="text-muted">Vol. capacity</dt>
        <dd className="font-mono">{e.capacity_vol.toFixed(0)} mAh/cm³</dd>
        <dt className="text-muted">Vol. energy</dt>
        <dd className="font-mono">{e.energy_vol.toFixed(0)} Wh/L</dd>
        <dt className="text-muted">E hull (charged)</dt>
        <dd className="font-mono">{e.stability_charge.toFixed(3)} eV/at</dd>
      </dl>
    </div>
  );
}

export function ElectrodeExplorer() {
  const [ion, setIon] = useState("Li");
  const [elements, setElements] = useState("");
  const [vMin, setVMin] = useState("");
  const [capMin, setCapMin] = useState("");
  const [dvMax, setDvMax] = useState("");
  const [stabMax, setStabMax] = useState("0.05");
  const [sort, setSort] = useState("-energy_grav");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Response | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiGet<Response>("/electrodes", {
          working_ion: ion,
          elements,
          average_voltage_min: vMin,
          capacity_grav_min: capMin,
          max_delta_volume_max: dvMax ? Number(dvMax) / 100 : undefined,
          stability_discharge_max: stabMax,
          sort,
          limit: PAGE,
          skip: p * PAGE,
        }),
      );
      setPage(p);
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(0);
  };
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="ion">Working ion</Label>
              <select id="ion" value={ion} onChange={(e) => setIon(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                {IONS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="els" hint="framework must contain">
                Elements
              </Label>
              <Input id="els" value={elements} onChange={(e) => setElements(e.target.value)} placeholder="e.g. Fe P O" />
            </div>
            <div>
              <Label htmlFor="sort">Sort by</Label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="vmin">Min. voltage (V)</Label>
              <Input id="vmin" inputMode="decimal" value={vMin} onChange={(e) => setVMin(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label htmlFor="cap">Min. capacity (mAh/g)</Label>
              <Input id="cap" inputMode="decimal" value={capMin} onChange={(e) => setCapMin(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label htmlFor="dv">Max. volume change (%)</Label>
              <Input id="dv" inputMode="decimal" value={dvMax} onChange={(e) => setDvMax(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label htmlFor="stab" hint="discharged state">
                Max. E above hull (eV/atom)
              </Label>
              <Input id="stab" inputMode="decimal" value={stabMax} onChange={(e) => setStabMax(e.target.value)} className="font-mono" />
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={loading} className="w-full">
                <Search className="size-4" aria-hidden /> Search electrodes
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {error && <Notice>{error}</Notice>}

      {data && (
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm">
            <span className="text-muted">
              {data.total.toLocaleString()} electrode{data.total === 1 ? "" : "s"}
              {data.total > 0 && ` · page ${page + 1} of ${pages}`}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" className="px-2" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => run(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" className="px-2" aria-label="Next page" disabled={page + 1 >= pages || loading} onClick={() => run(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Electrode</th>
                  <th className="px-3 py-2.5 font-medium">Voltage (V)</th>
                  <th className="px-3 py-2.5 font-medium">Capacity (mAh/g)</th>
                  <th className="px-3 py-2.5 font-medium">Energy (Wh/kg)</th>
                  <th className="px-3 py-2.5 font-medium">ΔV (%)</th>
                  <th className="px-3 py-2.5 font-medium">E hull (eV/at)</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((e) => {
                  const key = `${e.id_charge}-${e.id_discharge}`;
                  const isOpen = open === key;
                  return (
                    <Fragment key={key}>
                      <tr className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(isOpen ? null : key)}>
                        <td className="px-5 py-2 font-medium">{e.battery_formula}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{e.average_voltage.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{e.capacity_grav.toFixed(0)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{e.energy_grav.toFixed(0)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{(e.max_delta_volume * 100).toFixed(1)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{e.stability_discharge.toFixed(3)}</td>
                        <td className="px-3 py-2">
                          <ChevronDown className={clsx("size-4 text-muted transition", isOpen && "rotate-180")} aria-label={isOpen ? "Hide details" : "Show voltage profile"} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-surface-2/50 px-5">
                            <Profile e={e} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.total === 0 && <p className="px-5 py-6 text-sm text-muted">No electrodes match these filters.</p>}
        </Card>
      )}
      <p className="text-xs text-muted">
        Calculated insertion-electrode data from the Materials Project (DFT, GGA/GGA+U). Voltages and capacities are
        thermodynamic averages between the listed charged and discharged phases; kinetics and side reactions are not included.
      </p>
    </div>
  );
}
