import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { ImageAnalyzer } from "./image-analyzer";

export const metadata: Metadata = { title: "Image Analysis" };

export default function ImageAnalysisPage() {
  return (
    <>
      <PageHeader
        title="Image Analysis"
        description="Measure grain size (ASTM E112 planimetric and lineal-intercept methods) and porosity from optical or SEM micrographs — automatically thresholded, calibrated with the scale bar, entirely in your browser."
      />
      <ImageAnalyzer />
    </>
  );
}
