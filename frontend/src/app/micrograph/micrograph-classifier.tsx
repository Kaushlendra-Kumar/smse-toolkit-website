"use client";

import clsx from "clsx";
import { Download, ImageUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import {
  classifyMicrograph,
  loadMicrographMeta,
  preloadMicrographModel,
  type MicrographMeta,
  type MicrographResult,
} from "@/lib/micrograph-model";

import { CamView } from "./cam-view";

const SAMPLES = ["Fibres", "Nanowires", "Particles", "Porous_Sponge", "Biological", "Tips"];
const pretty = (label: string) => label.replaceAll("_", " ");
const MAX_BATCH = 200;

type BatchRow = { name: string; top?: string; prob?: number; second?: string; secondProb?: number; error?: string };

function toCsv(rows: BatchRow[]) {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const header = ["file", "predicted_class", "confidence", "second_class", "second_confidence", "error"];
  const lines = rows.map((r) =>
    [r.name, r.top && pretty(r.top), r.prob?.toFixed(4), r.second && pretty(r.second), r.secondProb?.toFixed(4), r.error].map(esc).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows: BatchRow[]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "micrograph-predictions.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MicrographClassifier() {
  const [info, setInfo] = useState<MicrographMeta | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<MicrographResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [batch, setBatch] = useState<BatchRow[] | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMicrographMeta()
      .then(setInfo)
      .catch((e) => setInfoError(e.message));
    preloadMicrographModel(); // fetch the ~17 MB model + runtime while the user picks an image
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const classify = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG or PNG).");
      return;
    }
    setBatch(null);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(await classifyMicrograph(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const classifyBatch = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_BATCH);
    setResult(null);
    setPreview(null);
    setError(files.length > MAX_BATCH ? `Only the first ${MAX_BATCH} images are processed.` : null);
    setBatchTotal(images.length);
    setBatch([]);
    setLoading(true);
    for (const f of images) {
      let row: BatchRow;
      try {
        const r = await classifyMicrograph(f);
        const [a, b] = r.predictions;
        row = { name: f.name, top: a.label, prob: a.probability, second: b.label, secondProb: b.probability };
      } catch (e) {
        row = { name: f.name, error: (e as Error).message };
      }
      setBatch((rows) => [...(rows ?? []), row]);
    }
    setLoading(false);
  }, []);

  const handleFiles = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = [...(list ?? [])];
      if (files.length === 1) classify(files[0]);
      else if (files.length > 1) classifyBatch(files);
    },
    [classify, classifyBatch],
  );

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) classify(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [classify]);

  const loadSample = async (name: string) => {
    const res = await fetch(`/samples/${name}.jpg`);
    classify(new File([await res.blob()], `${name}.jpg`, { type: "image/jpeg" }));
  };

  const top = result?.predictions[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload micrographs"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={clsx(
              "relative flex aspect-4/3 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-surface transition focus-visible:outline-2 focus-visible:outline-accent",
              dragging ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview} alt="Uploaded micrograph" className="size-full object-contain" />
            ) : (
              <div className="px-6 text-center">
                <ImageUp className="mx-auto size-10 text-muted" aria-hidden />
                <p className="mt-3 font-medium">Drop SEM images here, click to browse, or paste</p>
                <p className="mt-1 text-sm text-muted">
                  JPG or PNG · select several for a batch with CSV export · analysed in your browser, never uploaded
                </p>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div>
            <p className="mb-2 text-sm text-muted">Or try a sample from the held-out test set:</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <Button key={s} variant="ghost" className="px-3 py-1.5" onClick={() => loadSample(s)}>
                  {pretty(s)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {infoError && <Notice>{infoError}</Notice>}
          {error && <Notice>{error}</Notice>}

          {!batch && (
            <Card>
              <CardTitle>Prediction</CardTitle>
              {loading && <p className="text-muted">Analysing… (the first run loads the model, ~17 MB)</p>}
              {!loading && !result && <p className="text-muted">Upload a micrograph to see what the model thinks it shows.</p>}
              {top && info && (
                <div className="mb-5">
                  <p className="text-2xl font-semibold">{pretty(top.label)}</p>
                  <p className="text-sm text-muted">
                    {(top.probability * 100).toFixed(1)}% confidence
                    {top.probability < 0.5 && " — low confidence; the image may not match any trained category well."}
                  </p>
                  <p className="mt-2 text-sm">{info.descriptions[top.label]}</p>
                </div>
              )}
              {result && (
                <ul className="space-y-2">
                  {result.predictions.map((p) => (
                    <li key={p.label} className="grid grid-cols-[minmax(0,14rem)_1fr_3.5rem] items-center gap-3 text-sm">
                      <span className="truncate" title={pretty(p.label)}>
                        {pretty(p.label)}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${p.probability * 100}%` }} />
                      </span>
                      <span className="text-right font-mono tabular-nums text-muted">{(p.probability * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {batch && (
            <Card className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Batch · {batch.length}/{batchTotal} images
                </h2>
                <Button variant="ghost" className="px-3 py-1 text-xs" disabled={!batch.length} onClick={() => downloadCsv(batch)}>
                  <Download className="size-3.5" aria-hidden /> CSV
                </Button>
              </div>
              <div className="max-h-112 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-5 py-2 font-medium">File</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 text-right font-medium">Conf.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {batch.map((r, i) => (
                      <tr key={`${r.name}-${i}`}>
                        <td className="max-w-48 truncate px-5 py-1.5" title={r.name}>
                          {r.name}
                        </td>
                        <td className="px-3 py-1.5">{r.error ? <span className="text-danger">{r.error}</span> : pretty(r.top!)}</td>
                        <td className={clsx("px-3 py-1.5 text-right font-mono tabular-nums", (r.prob ?? 1) < 0.5 && "text-warn")}>
                          {r.prob !== undefined ? `${(r.prob * 100).toFixed(1)}%` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <p className="px-5 py-3 text-sm text-muted">Classifying…</p>}
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {result && top && (
          <Card>
            <CardTitle>Where the model looked</CardTitle>
            <CamView input={result.input} cam={result.cam} camSize={result.camSize} label={pretty(top.label)} />
            <p className="mt-3 text-sm text-muted">
              This is the exact 224×224 crop the network analysed (the microscope&apos;s data bar is removed first). Bright areas
              contributed most to the “{pretty(top.label)}” prediction — a class activation map computed from the network&apos;s
              final feature maps.
            </p>
          </Card>
        )}

        {info && (
          <Card className={clsx(!result && "lg:col-start-2")}>
            <CardTitle aside={<Badge>{(info.metrics.val_accuracy * 100).toFixed(1)}% accuracy</Badge>}>About the model</CardTitle>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">Architecture</dt>
              <dd>{info.architecture}</dd>
              <dt className="text-muted">Macro F1</dt>
              <dd className="font-mono">{info.metrics.val_macro_f1.toFixed(3)}</dd>
              <dt className="text-muted">Images</dt>
              <dd>
                {info.metrics.n_train.toLocaleString()} train · {info.metrics.n_val.toLocaleString()} held-out
              </dd>
              <dt className="text-muted">Dataset</dt>
              <dd>{info.dataset}</dd>
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}
