import { ImageResponse } from "next/og";

export const alt = "SMSE AI Toolkit — AI tools for materials science";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TOOLS = ["Micrograph recognition", "Steel properties", "Materials Explorer", "Phase diagrams", "Citations"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0b0e14",
          color: "#e6e9ef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#0e7490" />
            <path d="M16 6.5l8.2 4.75v9.5L16 25.5l-8.2-4.75v-9.5z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="16" cy="16" r="2.6" fill="#fff" />
          </svg>
          <span style={{ fontSize: 36, fontWeight: 600 }}>SMSE AI Toolkit</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>AI tools for everyday materials research.</span>
          <span style={{ fontSize: 28, color: "#9aa3b2" }}>School of Materials Science and Engineering · NIT Calicut</span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {TOOLS.map((t) => (
            <span key={t} style={{ fontSize: 24, padding: "8px 18px", borderRadius: 999, background: "#0f2d36", color: "#22c3e0" }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
