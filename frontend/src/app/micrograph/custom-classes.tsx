"use client";

import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button, Card, CardTitle, Input, Notice } from "@/components/ui";
import { classifyMicrograph } from "@/lib/micrograph-model";
import { saveCustomClasses, toStored, type CustomClass } from "@/lib/micrograph-ood";

/** Few-shot lab classes: a few example images per class, stored in this browser, exportable. */
export function CustomClasses({ classes, onChange }: { classes: CustomClass[]; onChange: (c: CustomClass[]) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const target = useRef<string>("");

  const update = (next: CustomClass[]) => {
    saveCustomClasses(next);
    onChange(next);
  };

  const addExamples = async (files: FileList | null) => {
    const cls = target.current;
    if (!files?.length || !cls) return;
    setBusy(cls);
    setError(null);
    try {
      const embs: number[][] = [];
      for (const f of [...files].slice(0, 30)) embs.push(toStored((await classifyMicrograph(f)).embedding));
      update(classes.map((c) => (c.name === cls ? { ...c, examples: [...c.examples, ...embs] } : c)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, classes }, null, 0)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "micrograph-custom-classes.json" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming: CustomClass[] = data.classes;
      if (!Array.isArray(incoming) || !incoming.every((c) => typeof c.name === "string" && Array.isArray(c.examples))) throw new Error();
      const merged = [...classes];
      for (const c of incoming) {
        const existing = merged.find((m) => m.name === c.name);
        if (existing) existing.examples.push(...c.examples);
        else merged.push(c);
      }
      update(merged);
    } catch {
      setError("That file is not a custom-classes export from this toolkit.");
    }
  };

  return (
    <Card>
      <CardTitle
        aside={
          <div className="flex gap-1">
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => importInput.current?.click()}>
              <Upload className="size-3.5" aria-hidden /> Import
            </Button>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={exportJson} disabled={!classes.length}>
              <Download className="size-3.5" aria-hidden /> Export
            </Button>
          </div>
        }
      >
        Your lab&apos;s classes
      </CardTitle>
      <p className="mb-3 text-sm text-muted">
        Teach the tool your own categories (e.g. a specific alloy microstructure): give a class a name and add 5–20 example
        images. New images are compared with your examples using the network&apos;s learned features — no retraining, nothing
        uploaded. Export the file to share it with your lab.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n || classes.some((c) => c.name === n)) return;
          update([...classes, { name: n, examples: [] }]);
          setName("");
        }}
      >
        <Input aria-label="New class name" placeholder="New class name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button type="submit" variant="ghost">
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>
      {error && (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      )}
      {classes.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {classes.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{c.name}</span>
                <span className={c.examples.length < 5 ? "ml-2 text-xs text-warn" : "ml-2 text-xs text-muted"}>
                  {c.examples.length} example{c.examples.length === 1 ? "" : "s"}
                  {c.examples.length < 5 && " — add at least 5"}
                </span>
              </span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  className="px-2.5 py-1 text-xs"
                  loading={busy === c.name}
                  onClick={() => {
                    target.current = c.name;
                    addInput.current?.click();
                  }}
                >
                  <Plus className="size-3.5" aria-hidden /> images
                </Button>
                <button aria-label={`Delete ${c.name}`} onClick={() => update(classes.filter((x) => x.name !== c.name))} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <input ref={addInput} type="file" accept="image/*" multiple hidden onChange={(e) => (addExamples(e.target.files), (e.target.value = ""))} />
      <input ref={importInput} type="file" accept="application/json" hidden onChange={(e) => (importJson(e.target.files?.[0]), (e.target.value = ""))} />
    </Card>
  );
}
