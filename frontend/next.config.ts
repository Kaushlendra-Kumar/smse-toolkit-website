import type { NextConfig } from "next";

// Everything runs on one host (e.g. Vercel): ML models run in the browser, and the two
// external-API tools (Materials Project, citations) are Route Handlers under src/app/api.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Model files and the WASM runtime are large and versioned with each deploy: cache them.
    return [
      { source: "/models/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      { source: "/ort/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
};

export default nextConfig;
