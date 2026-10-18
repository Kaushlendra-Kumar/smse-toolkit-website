import { Atom, BookMarked, Database, FlaskConical, Microscope, type LucideIcon } from "lucide-react";

export type Tool = {
  href: string;
  name: string;
  short: string;
  description: string;
  icon: LucideIcon;
};

export const TOOLS: Tool[] = [
  {
    href: "/micrograph",
    name: "Micrograph Recognition",
    short: "Micrographs",
    description: "Upload an SEM image and a CNN classifies it into 10 nanoscience categories — fibres, particles, nanowires, porous sponge and more.",
    icon: Microscope,
  },
  {
    href: "/steel",
    name: "Steel Property Prediction",
    short: "Steel",
    description: "Predict 0.2% proof stress, tensile strength, elongation and reduction in area of low-alloy steels from composition and temperature.",
    icon: FlaskConical,
  },
  {
    href: "/materials",
    name: "Materials Explorer",
    short: "Materials",
    description: "Search 150,000+ materials in the Materials Project by band gap, elasticity, magnetism, dielectric, piezoelectric and surface properties.",
    icon: Database,
  },
  {
    href: "/periodic-table",
    name: "Periodic Table",
    short: "Elements",
    description: "Interactive periodic table with atomic data; jump from any element straight into the Materials Explorer.",
    icon: Atom,
  },
  {
    href: "/citations",
    name: "Citation Generator",
    short: "Citations",
    description: "Turn a DOI or a messy reference into IEEE, APA, MLA, Chicago/Turabian, Harvard or Vancouver — plus BibTeX.",
    icon: BookMarked,
  },
];
