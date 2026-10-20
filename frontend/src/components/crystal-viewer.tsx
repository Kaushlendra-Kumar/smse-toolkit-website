"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import ELEMENTS from "@/lib/elements.json";

export type Structure = {
  lattice: { matrix: number[][]; a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
  sites: { species: { element: string; occu: number }[]; abc: number[] }[];
};

const CPK = Object.fromEntries(ELEMENTS.map((e) => [e.s, (e as { cpk?: string }).cpk ?? "#ff1493"]));
const TOL = 0.02;

/** Fractional → Cartesian positions, adding periodic images on cell faces/edges/corners. */
function buildAtoms(s: Structure, reps: number) {
  const m = s.lattice.matrix;
  const atoms: { el: string; pos: THREE.Vector3 }[] = [];
  for (const site of s.sites) {
    const el = [...site.species].sort((p, q) => q.occu - p.occu)[0].element; // majority species on mixed sites
    const base = site.abc.map((f) => ((f % 1) + 1) % 1);
    const shifts = base.map((f) => (f < TOL ? [0, reps] : [0]));
    for (let i = 0; i < reps; i++)
      for (let j = 0; j < reps; j++)
        for (let k = 0; k < reps; k++)
          for (const sa of shifts[0])
            for (const sb of shifts[1])
              for (const sc of shifts[2]) {
                const f = [base[0] + i + (sa && i === 0 ? sa : 0), base[1] + j + (sb && j === 0 ? sb : 0), base[2] + k + (sc && k === 0 ? sc : 0)];
                if (f.some((v) => v > reps + TOL)) continue;
                atoms.push({
                  el,
                  pos: new THREE.Vector3(
                    f[0] * m[0][0] + f[1] * m[1][0] + f[2] * m[2][0],
                    f[0] * m[0][1] + f[1] * m[1][1] + f[2] * m[2][1],
                    f[0] * m[0][2] + f[1] * m[1][2] + f[2] * m[2][2],
                  ),
                });
              }
  }
  // De-duplicate images that coincide.
  const seen = new Set<string>();
  return atoms.filter((a) => {
    const key = `${a.el}:${a.pos.toArray().map((v) => v.toFixed(2)).join(",")}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export function CrystalViewer({ structure }: { structure: Structure }) {
  const mount = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState(true);
  const [supercell, setSupercell] = useState(false);
  const rotateRef = useRef(rotate);
  useEffect(() => {
    rotateRef.current = rotate; // read by the animation loop without rebuilding the scene
  }, [rotate]);

  const elements = useMemo(
    () => [...new Set(structure.sites.map((s) => [...s.species].sort((p, q) => q.occu - p.occu)[0].element))],
    [structure],
  );

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reps = supercell ? 2 : 1;
    const atoms = buildAtoms(structure, reps);
    const m = structure.lattice.matrix.map((v) => new THREE.Vector3(...v).multiplyScalar(reps));

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 8, 10);
    scene.add(sun);

    // Sphere size: a fraction of the shortest interatomic distance, so atoms never overlap.
    let dmin = Infinity;
    for (let i = 0; i < atoms.length; i++)
      for (let j = i + 1; j < atoms.length; j++) dmin = Math.min(dmin, atoms[i].pos.distanceTo(atoms[j].pos));
    const radius = Math.min(0.9, Math.max(0.25, (Number.isFinite(dmin) ? dmin : 2) * 0.32));

    const sphere = new THREE.SphereGeometry(radius, 32, 24);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    for (const a of atoms) {
      let mat = materials.get(a.el);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: CPK[a.el] ?? "#ff1493", roughness: 0.45, metalness: 0.1 });
        materials.set(a.el, mat);
      }
      const mesh = new THREE.Mesh(sphere, mat);
      mesh.position.copy(a.pos);
      group.add(mesh);
    }

    // Unit-cell edges.
    const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => [i, j, k])));
    const pts: THREE.Vector3[] = [];
    for (const c1 of corners)
      for (const c2 of corners) {
        const diff = c1.reduce((n, v, idx) => n + Math.abs(v - c2[idx]), 0);
        if (diff === 1 && c1.join() < c2.join()) {
          for (const c of [c1, c2]) pts.push(m[0].clone().multiplyScalar(c[0]).add(m[1].clone().multiplyScalar(c[1])).add(m[2].clone().multiplyScalar(c[2])));
        }
      }
    const lineMat = new THREE.LineBasicMaterial({ color: getComputedStyle(el).color });
    const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    group.add(edges);

    // Centre the cell at the origin and fit the camera to the structure's bounding sphere.
    const center = m[0].clone().add(m[1]).add(m[2]).multiplyScalar(0.5);
    group.position.copy(center.clone().negate());
    const box = new THREE.Box3().setFromObject(group);
    const radiusAll = box.getBoundingSphere(new THREE.Sphere()).radius;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const dist = (radiusAll / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
    camera.position.copy(new THREE.Vector3(0.55, 0.4, 0.75).normalize().multiplyScalar(dist));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Interactive 3D crystal structure; drag to rotate, scroll to zoom");

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.2;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let frame = 0;
    const tick = () => {
      controls.autoRotate = rotateRef.current;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      sphere.dispose();
      materials.forEach((mat) => mat.dispose());
      edges.geometry.dispose();
      lineMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [structure, supercell]);

  const l = structure.lattice;
  return (
    <div>
      <div ref={mount} className="aspect-square w-full touch-none overflow-hidden rounded-lg border border-line bg-surface-2 text-muted" />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="size-4 accent-accent" />
          Auto-rotate
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={supercell} onChange={(e) => setSupercell(e.target.checked)} className="size-4 accent-accent" />
          2×2×2 supercell
        </label>
        <ul className="flex flex-wrap gap-3" aria-label="Element colours">
          {elements.map((e) => (
            <li key={e} className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-line" style={{ background: CPK[e] }} aria-hidden />
              {e}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        a={l.a.toFixed(3)} b={l.b.toFixed(3)} c={l.c.toFixed(3)} Å · α={l.alpha.toFixed(1)}° β={l.beta.toFixed(1)}° γ={l.gamma.toFixed(1)}°
      </p>
    </div>
  );
}
