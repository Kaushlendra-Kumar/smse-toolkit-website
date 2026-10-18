import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { SteelPredictor } from "./steel-predictor";

export const metadata: Metadata = { title: "Steel Property Prediction" };

export default function SteelPage() {
  return (
    <>
      <PageHeader
        title="Steel Property Prediction"
        description="Estimate the mechanical properties of a low-alloy steel from its composition and test temperature. Trained on the NIMS MatNavi dataset of 900+ tensile tests."
      />
      <SteelPredictor />
    </>
  );
}
