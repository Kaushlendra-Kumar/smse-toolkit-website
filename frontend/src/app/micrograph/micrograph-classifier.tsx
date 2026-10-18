"use client";

import clsx from "clsx";
import { ImageUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import { apiGet, apiUpload } from "@/lib/api";

type Info = {
  classes: string[];
  descriptions: Record<string, string>;
  architecture: string;
  metrics: { val_accuracy: number; val_macro_f1: number; n_train: number; n_val: number };
  dataset: string;
};
type Result = { predictions: { label: string; probability: number }[]; image: { width: number; height: number } };

const SAMPLES = ["Fibres", "Nanowires", "Particles", "Porous_Sponge", "Biological", "Tips"];
const pretty = (label: string) => label.replaceAll("_", " ");

export function MicrographClassifier() {
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Info>("/micrograph/info")
      .then(setInfo)
      .catch((e) => setInfoError(e.message));
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const classify = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG or TIFF).");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(await apiUpload<Result>("/micrograph/predict", file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a micrograph"
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
            const f = e.dataTransfer.files[0];
            if (f) classify(f);
          }}
          className={clsx(
            "relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-surface transition focus-visible:outline-2 focus-visible:outline-accent",
            dragging ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={preview} alt="Uploaded micrograph" className="size-full object-contain" />
          ) : (
            <div className="px-6 text-center">
              <ImageUp className="mx-auto size-10 text-muted" aria-hidden />
              <p className="mt-3 font-medium">Drop an SEM image here, click to browse, or paste</p>
              <p className="mt-1 text-sm text-muted">JPG, PNG or TIFF · up to 15 MB</p>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) classify(f);
            e.target.value = "";
          }}
        />
        <div>
          <p className="mb-2 text-sm text-muted">Or try a sample from the dataset:</p>
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

        <Card>
          <CardTitle>Prediction</CardTitle>
          {loading && <p className="text-muted">Analysing…</p>}
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
                <li key={p.label} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-sm">
                  <span className="truncate">{pretty(p.label)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${p.probability * 100}%` }} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-muted">{(p.probability * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {info && (
          <Card>
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
