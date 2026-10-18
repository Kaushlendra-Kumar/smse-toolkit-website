import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui";

import { MaterialsExplorer } from "./materials-explorer";

export const metadata: Metadata = { title: "Materials Explorer" };

export default function MaterialsPage() {
  return (
    <>
      <PageHeader
        title="Materials Explorer"
        description="Search computed properties of materials in the Materials Project database — semiconductors by band gap, elastic moduli, magnetism, dielectric and piezoelectric response, and surfaces."
      />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <MaterialsExplorer />
      </Suspense>
    </>
  );
}
