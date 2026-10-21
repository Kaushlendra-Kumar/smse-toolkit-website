"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { isosurface, upsample } from "@/lib/isosurface";

export type FermiData = {
  n: number;
  reciprocal: number[][];
  sheets: { spin: number; band: number; values: number[] }[];
};

const COLORS = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f59f00", "#c2255c", "#0ca678", "#5c7cfa"];

/** Interactive Fermi surface: one colour per band sheet, shown in the Γ-centred reciprocal cell. */
export function FermiViewer({ data }: { data: FermiData }) {
  const mount = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<boolean[]>(() => data.sheets.map(() => true));
  const visibleRef = useRef(visible);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // Extract the surfaces once per data set (upsampled for smoothness).
  const meshes = useMemo(() => {
    const u = Math.max(1, Math.min(3, Math.round(42 / data.n)));
    const m = data.n * u;
    return data.sheets.map((s) => isosurface(upsample(Float32Array.from(s.values), data.n, u), m, data.reciprocal, 0));
  }, [data]);

  useEffect(() => {
    visibleRef.current = visible;
    meshesRef.current.forEach((mesh, i) => (mesh.visible = visible[i]));
  }, [visible]);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 5, 6);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xffffff, 0.6);
    back.position.set(-4, -3, -5);
    scene.add(back);

    const created: THREE.Mesh[] = [];
    meshes.forEach((mesh, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS[i % COLORS.length],
        side: THREE.DoubleSide,
        roughness: 0.45,
        metalness: 0.05,
      });
      const obj = new THREE.Mesh(geo, mat);
      obj.visible = visibleRef.current[i];
      scene.add(obj);
      created.push(obj);
    });
    meshesRef.current = created;

    // Γ-centred reciprocal cell edges.
    const B = data.reciprocal.map((v) => new THREE.Vector3(...v));
    const corner = (f: number[]) => B[0].clone().multiplyScalar(f[0] - 0.5).add(B[1].clone().multiplyScalar(f[1] - 0.5)).add(B[2].clone().multiplyScalar(f[2] - 0.5));
    const pts: THREE.Vector3[] = [];
    const cs = [0, 1].flatMap((a) => [0, 1].flatMap((b) => [0, 1].map((c) => [a, b, c])));
    for (const p of cs) for (const q of cs) if (p.reduce((s, v, i) => s + Math.abs(v - q[i]), 0) === 1 && p.join() < q.join()) pts.push(corner(p), corner(q));
    const lineMat = new THREE.LineBasicMaterial({ color: getComputedStyle(el).color });
    const cell = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    scene.add(cell);
    const gamma = new THREE.Mesh(new THREE.SphereGeometry(0.04 * B[0].length(), 16, 12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    scene.add(gamma);

    const radius = new THREE.Box3().setFromObject(cell).getBoundingSphere(new THREE.Sphere()).radius;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    camera.position.copy(new THREE.Vector3(0.6, 0.45, 0.7).normalize().multiplyScalar((radius / Math.sin((20 * Math.PI) / 180)) * 1.05));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Interactive 3D Fermi surface; drag to rotate, scroll to zoom");
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      created.forEach((o) => {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
      cell.geometry.dispose();
      lineMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [meshes, data.reciprocal]);

  return (
    <div>
      <div ref={mount} className="aspect-square w-full touch-none overflow-hidden rounded-lg border border-line bg-surface-2 text-muted" />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Fermi surface sheets">
        {data.sheets.map((s, i) => (
          <li key={`${s.spin}-${s.band}`}>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={visible[i]}
                onChange={(e) => setVisible((v) => v.map((x, j) => (j === i ? e.target.checked : x)))}
                className="size-4"
                style={{ accentColor: COLORS[i % COLORS.length] }}
              />
              band {s.band + 1}
              {data.sheets.some((t) => t.spin === -1) ? (s.spin === 1 ? " ↑" : " ↓") : ""}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
