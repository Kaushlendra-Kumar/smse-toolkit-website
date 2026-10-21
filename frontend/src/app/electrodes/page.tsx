import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { ElectrodeExplorer } from "./electrode-explorer";

export const metadata: Metadata = { title: "Battery Electrodes" };

export default function ElectrodesPage() {
  return (
    <>
      <PageHeader
        title="Battery Electrodes"
        description="Search calculated insertion electrodes for Li, Na, K, Mg, Ca, Zn and Al batteries by voltage, capacity, energy density, volume change and stability — with voltage profiles."
      />
      <ElectrodeExplorer />
    </>
  );
}
