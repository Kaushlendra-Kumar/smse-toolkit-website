import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { PeriodicTable } from "./periodic-table";

export const metadata: Metadata = { title: "Periodic Table" };

export default function PeriodicTablePage() {
  return (
    <>
      <PageHeader title="Periodic Table" description="Atomic data for all 118 elements. Select an element to see its properties and search for materials that contain it." />
      <PeriodicTable />
    </>
  );
}
