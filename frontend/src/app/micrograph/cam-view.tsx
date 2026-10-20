"use client";

import { useEffect, useRef, useState } from "react";

// Perceptually ordered "inferno"-like stops (dark → bright) for the activation map.
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 0, 4]],
  [0.25, [87, 16, 110]],
  [0.5, [188, 55, 84]],
  [0.75, [249, 142, 9]],
  [1, [252, 255, 164]],
];

function colormap(t: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + f * (c1[j] - c0[j]))) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** The model's 224×224 input with its class activation map overlaid. */
export function CamView({ input, cam, camSize, label }: { input: ImageData; cam: Float32Array; camSize: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(0.75);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(input, 0, 0);
    if (!show) return;
    // Build the small heat image, then let the canvas upscale it smoothly (bilinear).
    // Alpha follows activation, so weak regions stay clear and the micrograph remains readable.
    const heat = new ImageData(camSize, camSize);
    for (let i = 0; i < cam.length; i++) {
      const [r, g, b] = colormap(cam[i]);
      heat.data.set([r, g, b, Math.round(255 * opacity * Math.pow(cam[i], 0.8))], i * 4);
    }
    const small = new OffscreenCanvas(camSize, camSize);
    small.getContext("2d")!.putImageData(heat, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, input.width, input.height);
  }, [input, cam, camSize, show, opacity]);

  return (
    <div>
      <canvas
        ref={ref}
        role="img"
        aria-label={`Model input with heatmap of the regions that support “${label}”`}
        className="aspect-square w-full max-w-sm rounded-lg border border-line [image-rendering:auto]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-accent" />
          Show heatmap
        </label>
        <label className="flex items-center gap-2">
          Opacity
          <input
            type="range"
            min={0.15}
            max={0.9}
            step={0.05}
            value={opacity}
            disabled={!show}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-28 accent-accent"
          />
        </label>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          low
          <span
            className="h-2 w-20 rounded-full"
            style={{ background: `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(",")})` }}
          />
          high influence
        </span>
      </div>
    </div>
  );
}
