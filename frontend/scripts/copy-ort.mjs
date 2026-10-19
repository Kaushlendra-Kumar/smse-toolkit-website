// Copies the ONNX Runtime Web WASM binary into public/ort/ so it is served by this site
// (same version as the installed package). Runs automatically after `pnpm install`.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = new URL("../public/ort/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  // Both files are listed in the package's "exports", so they resolve directly.
  copyFileSync(fileURLToPath(import.meta.resolve(`onnxruntime-web/${f}`)), new URL(f, out));
}
console.log("onnxruntime-web WASM copied to public/ort/");
