import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: { default: "SMSE AI Toolkit", template: "%s · SMSE AI Toolkit" },
  description:
    "AI tools for materials science: SEM micrograph recognition, steel property prediction, Materials Project lookup, phase diagrams and citation generation.",
  openGraph: { siteName: "SMSE AI Toolkit", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
            <span>SMSE AI Toolkit · School of Materials Science and Engineering, NIT Calicut</span>
            <span>
              Data: <a className="underline hover:text-fg" href="https://materialsproject.org">Materials Project</a>,{" "}
              <a className="underline hover:text-fg" href="https://doi.org/10.1038/sdata.2018.172">NFFA-EUROPE SEM</a>, NIMS MatNavi
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
