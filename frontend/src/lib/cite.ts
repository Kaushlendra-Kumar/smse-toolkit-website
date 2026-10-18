import { Cite, plugins, type CSL } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";

export type { CSL };

/** label -> [citation-js template id, CSL file in /public/csl or null if built in] */
export const STYLES = {
  IEEE: ["ieee", "ieee.csl"],
  "APA 7th": ["apa-7", "apa.csl"],
  "MLA 9th": ["mla-9", "modern-language-association.csl"],
  "Chicago / Turabian (author-date)": ["chicago-ad", "chicago-author-date.csl"],
  "Chicago / Turabian (notes-bibliography)": ["chicago-nb", "chicago-notes-bibliography.csl"],
  "Harvard (Cite Them Right)": ["harvard-ctr", "harvard-cite-them-right.csl"],
  Vancouver: ["vancouver", null],
} as const satisfies Record<string, readonly [string, string | null]>;

export type StyleLabel = keyof typeof STYLES;
export const STYLE_LABELS = Object.keys(STYLES) as StyleLabel[];

const loaded = new Map<string, Promise<void>>();

function ensureStyle(label: StyleLabel): Promise<void> {
  const [id, file] = STYLES[label];
  if (!file) return Promise.resolve();
  if (!loaded.has(id)) {
    loaded.set(
      id,
      fetch(`/csl/${file}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Could not load citation style ${file}`);
          return r.text();
        })
        .then((xml) => plugins.config.get("@csl").styles.add(id, xml))
        .catch((e) => {
          loaded.delete(id);
          throw e;
        }),
    );
  }
  return loaded.get(id)!;
}

export async function formatBibliography(items: CSL[], label: StyleLabel, format: "text" | "html" = "text"): Promise<string> {
  await ensureStyle(label);
  return new Cite(items).format("bibliography", { format, style: STYLES[label][0], lang: "en-US" }) as string;
}

export function toBibtex(items: CSL[]): string {
  return new Cite(items).format("bibtex") as string;
}
