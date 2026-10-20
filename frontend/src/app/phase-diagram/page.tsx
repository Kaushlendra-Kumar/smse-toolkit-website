import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { PhaseDiagram } from "./phase-diagram";

export const metadata: Metadata = { title: "Phase Diagram" };

export default function PhaseDiagramPage() {
  return (
    <>
      <PageHeader
        title="Phase Diagram"
        description="Binary formation-energy convex hull: which compounds of two elements are thermodynamically stable, and how far the others sit above the hull. Data from the Materials Project."
      />
      <PhaseDiagram />
    </>
  );
}
