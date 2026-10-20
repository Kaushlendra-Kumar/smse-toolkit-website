import type { Metadata } from "next";
import { Suspense } from "react";

import { MaterialDetail } from "./material-detail";

export async function generateMetadata({ params }: PageProps<"/materials/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default function MaterialPage({ params }: PageProps<"/materials/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <MaterialDetail id={params.then((p) => p.id)} />
    </Suspense>
  );
}
