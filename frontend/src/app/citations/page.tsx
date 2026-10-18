import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";

import { CitationGenerator } from "./citation-generator";

export const metadata: Metadata = { title: "Citation Generator" };

export default function CitationsPage() {
  return (
    <>
      <PageHeader
        title="Citation Generator"
        description="Look up a reference by DOI or title, or enter it by hand, and get it formatted in IEEE, APA, MLA, Chicago/Turabian, Harvard or Vancouver — plus BibTeX."
      />
      <CitationGenerator />
    </>
  );
}
