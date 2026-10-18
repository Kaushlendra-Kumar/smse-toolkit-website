import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { MicrographClassifier } from "./micrograph-classifier";

export const metadata: Metadata = { title: "Micrograph Recognition" };

export default function MicrographPage() {
  return (
    <>
      <PageHeader
        title="Micrograph Recognition"
        description="Classify scanning electron microscope images into ten nanoscience categories using a convolutional neural network fine-tuned on the NFFA-EUROPE SEM dataset."
      />
      <MicrographClassifier />
    </>
  );
}
