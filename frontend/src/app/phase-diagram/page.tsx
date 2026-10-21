import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { PhaseDiagram } from "./phase-diagram";

export const metadata: Metadata = { title: "Phase Diagram" };

export default function PhaseDiagramPage() {
  return (
    <>
      <PageHeader
        title="Phase Diagram"
        description="Formation-energy convex hulls for two- or three-element systems: which compounds are thermodynamically stable, which phases coexist (tie-lines), and how far the others sit above the hull. Data from the Materials Project."
      />
      <PhaseDiagram />
    </>
  );
}
