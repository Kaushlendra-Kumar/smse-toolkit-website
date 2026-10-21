/**
 * PDF property report for a material page, generated in the browser (jsPDF).
 * Charts on the page are SVG (XRD, band structure) or WebGL (crystal); they are rasterised
 * with a fixed light palette so the PDF prints the same whatever theme the site is in.
 * The built-in PDF fonts only cover Latin-1, so report text uses plain notation (Fe3+, 2-theta).
 */

// Light theme tokens (globals.css) — used to resolve var(--…) when rasterising charts.
const LIGHT: Record<string, string> = {
  "--bg": "#ffffff",
  "--surface": "#ffffff",
  "--surface-2": "#f0f2f5",
  "--fg": "#0f172a",
  "--muted": "#5b6475",
  "--line": "#d5dae2",
  "--accent": "#0e7490",
};
const resolveVars = (s: string) => s.replace(/var\((--[a-z0-9-]+)\)/g, (_, v) => LIGHT[v] ?? "#000");

async function svgToPng(svg: SVGSVGElement, width = 1400): Promise<{ data: string; ratio: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const ratio = vb.height / vb.width;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(Math.round(width * ratio)));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("font-family", "Helvetica, Arial, sans-serif");
  for (const el of [clone, ...clone.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) if (attr.value.includes("var(")) el.setAttribute(attr.name, resolveVars(attr.value));
  }
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(vb.x));
  bg.setAttribute("y", String(vb.y));
  bg.setAttribute("width", String(vb.width));
  bg.setAttribute("height", String(vb.height));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Could not render chart"));
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round(width * ratio);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/jpeg", 0.9), ratio };
}

function canvasToPng(canvas: HTMLCanvasElement): { data: string; ratio: number } {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return { data: c.toDataURL("image/jpeg", 0.9), ratio: canvas.height / canvas.width };
}

const plainCharge = (v: number) => (v === 0 ? "0" : `${+Math.abs(v).toFixed(2) === 1 ? "" : +Math.abs(v).toFixed(2)}${v > 0 ? "+" : "-"}`);
const ascii = (s: string) =>
  s
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/Å/g, "A")
    .replace(/[μµ]/g, "u")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");

export type ReportInput = {
  material: Record<string, unknown> & { material_id: string; formula_pretty: string };
  groups: [string, [string, string, string?][]][];
  format: (v: unknown) => string | null;
  oxidation: { method: string | null; sites: { element: string; valence: number; sites: number }[] } | null;
  similar: { material_id: string; formula_pretty: string; band_gap: number | null; energy_above_hull: number | null }[];
};

export async function downloadMaterialReport({ material: m, groups, format, oxidation, similar }: ReportInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 15;
  const accent: [number, number, number] = [14, 116, 144];
  let y = M;

  // Header
  doc.setFillColor(...accent);
  doc.rect(0, 0, W, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("SMSE AI Toolkit - Material property report", M, 6.5);
  doc.text(new Date().toISOString().slice(0, 10), W - M, 6.5, { align: "right" });
  y = 22;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(22);
  doc.text(ascii(m.formula_pretty), M, y);
  doc.setFontSize(10);
  doc.setTextColor(91, 100, 117);
  const sub = [m.material_id, format(m.crystal_system), format(m.spacegroup) && `space group ${format(m.spacegroup)}`, m.is_stable === true ? "thermodynamically stable" : null]
    .filter(Boolean)
    .join("  |  ");
  doc.text(ascii(sub), M, y + 6);
  y += 12;

  // Crystal structure snapshot + key properties
  const crystal = document.querySelector<HTMLCanvasElement>("canvas[aria-label^='Interactive 3D crystal']");
  if (crystal) {
    const { data, ratio } = canvasToPng(crystal);
    const w = 70;
    doc.addImage(data, "JPEG", M, y, w, w * ratio);
  }
  const key: [string, string][] = (
    [
      ["Density", m.density, "g/cm3"],
      ["Volume", m.volume, "A^3"],
      ["Sites in cell", m.nsites, ""],
      ["Formation energy", m.formation_energy_per_atom, "eV/atom"],
      ["Energy above hull", m.energy_above_hull, "eV/atom"],
      ["Band gap", m.band_gap, "eV"],
      ["Magnetic ordering", m.ordering, ""],
    ] as [string, unknown, string][]
  )
    .map(([k, v, u]) => [k, format(v) === null ? "" : `${format(v)} ${u}`.trim()] as [string, string])
    .filter(([, v]) => v);
  autoTable(doc, {
    startY: y,
    margin: { left: crystal ? M + 75 : M, right: M },
    head: [["Key property", "Value"]],
    body: key,
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: accent },
    theme: "striped",
  });
  y = Math.max(crystal ? y + 72 : y, (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;

  // Oxidation states
  if (oxidation?.sites.length) {
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Oxidation states", M, y);
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const line = oxidation.sites.map((s) => `${s.element}${plainCharge(s.valence)} (x${s.sites} sites)`).join(",  ");
    doc.text(doc.splitTextToSize(`${line}   - ${oxidation.method ?? "bond valence analysis"}`, W - 2 * M), M, y + 5);
    y += 13;
  }

  // All property groups
  const rows: string[][] = [];
  for (const [title, fields] of groups) {
    const r = fields.map(([f, label, unit]) => [title, label, format(m[f]), unit ?? ""] as const).filter(([, , v]) => v !== null);
    for (const [t, l, v, u] of r) rows.push([t, ascii(l), ascii(`${v}`), ascii(u)]);
  }
  autoTable(doc, {
    startY: y,
    head: [["Group", "Property", "Value", "Unit"]],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 1.4 },
    headStyles: { fillColor: accent },
    theme: "striped",
    margin: { left: M, right: M },
  });

  // Charts
  const addChart = async (selector: string, title: string) => {
    const svg = document.querySelector<SVGSVGElement>(selector);
    if (!svg) return;
    const { data, ratio } = await svgToPng(svg);
    const w = W - 2 * M;
    doc.addPage();
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(title, M, M + 4);
    doc.addImage(data, "JPEG", M, M + 8, w, w * ratio);
    return M + 8 + w * ratio;
  };
  const xrdBottom = await addChart("svg[aria-label^='Simulated powder X-ray']", "Simulated powder XRD pattern (Cu K-alpha unless changed on the page)");
  if (xrdBottom) {
    const table = document.querySelector("svg[aria-label^='Simulated powder X-ray']")?.closest("section")?.querySelector("table");
    if (table) {
      const body = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => ascii(td.textContent ?? "")));
      autoTable(doc, {
        startY: xrdBottom + 4,
        head: [["2-theta (deg)", "d (A)", "hkl (negative indices shown without overbar)", "I / Imax", "Mult."]],
        body,
        styles: { fontSize: 8.5, cellPadding: 1.3 },
        headStyles: { fillColor: accent },
        theme: "striped",
        margin: { left: M, right: M },
      });
    }
  }
  await addChart("svg[aria-label='Band structure and density of states']", "Electronic structure: band structure and density of states");

  // Isostructural materials
  if (similar.length) {
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? M;
    autoTable(doc, {
      startY: Math.min(lastY + 140, 250) > 250 ? M : undefined,
      head: [["Isostructural material", "ID", "Band gap (eV)", "E above hull (eV/atom)"]],
      body: similar.slice(0, 10).map((s) => [ascii(s.formula_pretty), s.material_id, format(s.band_gap) ?? "-", format(s.energy_above_hull) ?? "-"]),
      styles: { fontSize: 8.5, cellPadding: 1.3 },
      headStyles: { fillColor: accent },
      theme: "striped",
      margin: { left: M, right: M },
    });
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      doc.splitTextToSize(
        `Data: Materials Project (CC BY 4.0), DFT calculations - band gaps are typically underestimated; XRD simulated from the calculated structure. ` +
          `Generated by SMSE AI Toolkit, ${window.location.origin}/materials/${m.material_id}`,
        W - 2 * M - 20,
      ),
      M,
      287,
    );
    doc.text(`${p} / ${pages}`, W - M, 287, { align: "right" });
  }

  doc.save(`${ascii(m.formula_pretty)}_${m.material_id}_report.pdf`);
}
