// Mobilya modelleri: ilkel geometrilerden (kutu, silindir) kurulur, dışarıdan model
// indirilmez. Her kurucu metre cinsinden (w, d, h) ölçüsünde, zemin merkezinde duran,
// ön yüzü yerel +z'ye bakan bir grup döndürür. Plan tarafında ön yüz yerel +y'dir;
// view3d eşlemeyi yapar.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { rugTexture } from "./textures.js";

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.7, metalness: opts.metalness ?? 0,
      transparent: opts.opacity != null, opacity: opts.opacity ?? 1, map: opts.map ?? null
    }));
  }
  return matCache.get(key);
}

function box(g, w, h, d, x, y, z, material, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

function cyl(g, rTop, rBot, h, x, y, z, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

function legs(g, w, d, h, inset, r, material, tapered) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, r, tapered ? r * 0.6 : r, h, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), material, 10);
  }
}

const builders = {
  sofa(g, w, d, h, c) {
    const fab = mat(c.fabric, { roughness: 0.95 }), leg = mat(c.wood);
    const seatH = 0.42, armW = Math.min(0.2, w * 0.1), legH = 0.08;
    legs(g, w, d, legH, 0.08, 0.02, leg, true);
    box(g, w, seatH - legH, d, 0, legH + (seatH - legH) / 2, 0, fab, 0.04);
    box(g, w - armW * 2, h - seatH, 0.2, 0, seatH + (h - seatH) / 2, -d / 2 + 0.1, fab, 0.05);
    for (const s of [-1, 1]) box(g, armW, 0.62 - legH, d, s * (w / 2 - armW / 2), legH + (0.62 - legH) / 2, 0, fab, 0.05);
    const n = Math.max(1, Math.round((w - armW * 2) / 0.65));
    const cw = (w - armW * 2) / n;
    for (let i = 0; i < n; i++) box(g, cw - 0.02, 0.12, d - 0.26, -w / 2 + armW + cw * (i + 0.5), seatH + 0.06, 0.08, fab, 0.04);
    box(g, 0.45, 0.35, 0.12, -w / 2 + armW + 0.3, seatH + 0.25, -d / 2 + 0.28, mat(c.accent, { roughness: 0.9 }), 0.05);
  },
  "sofa-l"(g, w, d, h, c) {
    const fab = mat(c.fabric, { roughness: 0.95 });
    const depth = 0.9, seatH = 0.42;
    box(g, w, seatH, depth, 0, seatH / 2, -d / 2 + depth / 2, fab, 0.04);
    box(g, depth, seatH, d - depth, w / 2 - depth / 2, seatH / 2, depth / 2, fab, 0.04);
    box(g, w, h - seatH, 0.2, 0, seatH + (h - seatH) / 2, -d / 2 + 0.1, fab, 0.05);
    box(g, 0.2, h - seatH, d, w / 2 - 0.1, seatH + (h - seatH) / 2, 0, fab, 0.05);
    box(g, 0.2, 0.2, depth, -w / 2 + 0.1, seatH + 0.1, -d / 2 + depth / 2, fab, 0.05);
    box(g, 0.45, 0.35, 0.12, -w / 2 + 0.6, seatH + 0.25, -d / 2 + 0.28, mat(c.accent, { roughness: 0.9 }), 0.05);
  },
  armchair(g, w, d, h, c) {
    const fab = mat(c.accent2, { roughness: 0.95 }), leg = mat(c.wood);
    legs(g, w, d, 0.14, 0.08, 0.018, leg, true);
    box(g, w, 0.28, d, 0, 0.14 + 0.14, 0, fab, 0.05);
    box(g, w, h - 0.42, 0.16, 0, 0.42 + (h - 0.42) / 2, -d / 2 + 0.08, fab, 0.05);
    for (const s of [-1, 1]) box(g, 0.12, 0.26, d - 0.1, s * (w / 2 - 0.06), 0.55, 0.03, fab, 0.04);
  },
  pouf(g, w, d, h, c) { cyl(g, w / 2, w / 2, h, 0, h / 2, 0, mat(c.accent2, { roughness: 1 }), 24); },
  bench(g, w, d, h, c) {
    const wood = mat(c.wood);
    box(g, w, 0.05, d, 0, h - 0.025, 0, wood, 0.01);
    for (const s of [-1, 1]) box(g, 0.04, h - 0.05, d - 0.04, s * (w / 2 - 0.08), (h - 0.05) / 2, 0, wood);
  },
  bed(g, w, d, h, c) {
    const wood = mat(c.wood), linen = mat(c.fabric, { roughness: 1 }), acc = mat(c.accent, { roughness: 1 });
    box(g, w, 0.3, d, 0, 0.15, 0, wood, 0.02);
    box(g, w - 0.04, 0.22, d - 0.08, 0, 0.41, 0.03, mat("#f4f1ea", { roughness: 1 }), 0.05);
    box(g, w - 0.02, 0.05, d * 0.62, 0, 0.53, d * 0.18, linen, 0.03);
    box(g, w, h, 0.08, 0, h / 2, -d / 2 + 0.04, wood, 0.02);
    const n = w > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) box(g, (w - 0.2) / n - 0.05, 0.13, 0.4, -w / 2 + 0.1 + ((w - 0.2) / n) * (i + 0.5), 0.58, -d / 2 + 0.32, mat("#ffffff", { roughness: 1 }), 0.06);
    box(g, w - 0.02, 0.03, 0.5, 0, 0.555, d / 2 - 0.3, acc, 0.01);
  },
  "bed-low"(g, w, d, h, c) {
    const wood = mat(c.wood), linen = mat(c.fabric, { roughness: 1 });
    box(g, w + 0.1, 0.12, d + 0.1, 0, 0.06, 0, wood, 0.01);
    box(g, w - 0.04, 0.2, d - 0.06, 0, 0.22, 0.03, mat("#f3efe7", { roughness: 1 }), 0.06);
    box(g, w - 0.02, 0.04, d * 0.62, 0, 0.33, d * 0.18, linen, 0.02);
    box(g, w, h, 0.05, 0, h / 2, -d / 2 + 0.025, wood, 0.01);
    for (let i = 0; i < 2; i++) box(g, w / 2 - 0.12, 0.12, 0.38, -w / 4 + (w / 2) * i, 0.38, -d / 2 + 0.28, mat("#ffffff", { roughness: 1 }), 0.06);
  },
  cabinet(g, w, d, h, c) {
    const wood = mat(c.wood), metal = mat(c.metal, { metalness: 0.6, roughness: 0.35 });
    const legH = 0.1;
    legs(g, w, d, legH, 0.05, 0.015, metal);
    box(g, w, h - legH, d, 0, legH + (h - legH) / 2, 0, wood, 0.01);
    const rows = h > 0.7 ? 3 : 1;
    for (let i = 0; i < rows; i++) {
      const y = legH + (h - legH) * ((i + 0.5) / rows);
      box(g, w - 0.03, 0.004, 0.004, 0, legH + (h - legH) * (i / rows) + 0.002, d / 2, mat("#000000", { opacity: 0.25 }));
      box(g, Math.min(0.14, w * 0.3), 0.012, 0.02, 0, y, d / 2 + 0.01, metal);
    }
  },
  wardrobe(g, w, d, h, c) {
    const wood = mat(c.wood), metal = mat(c.metal, { metalness: 0.6, roughness: 0.35 });
    box(g, w, h, d, 0, h / 2, 0, wood, 0.01);
    const doors = Math.max(2, Math.round(w / 0.5));
    for (let i = 1; i < doors; i++) box(g, 0.004, h - 0.04, 0.004, -w / 2 + (w / doors) * i, h / 2, d / 2, mat("#000000", { opacity: 0.3 }));
    for (let i = 0; i < doors; i++) box(g, 0.015, 0.25, 0.02, -w / 2 + (w / doors) * (i + (i % 2 ? 0.12 : 0.88)), h * 0.52, d / 2 + 0.01, metal);
  },
  "low-table"(g, w, d, h, c) {
    const wood = mat(c.wood);
    box(g, w, 0.04, d, 0, h - 0.02, 0, wood, 0.015);
    legs(g, w, d, h - 0.04, 0.06, 0.02, wood, true);
    box(g, w - 0.16, 0.02, d - 0.14, 0, 0.12, 0, wood);
    cyl(g, 0.06, 0.05, 0.12, w * 0.2, h + 0.06, 0, mat(c.accent, { roughness: 0.5 }));
  },
  "round-table"(g, w, d, h, c) {
    const wood = mat(c.wood);
    cyl(g, w / 2, w / 2, 0.035, 0, h - 0.0175, 0, wood, 40);
    cyl(g, 0.04, 0.05, h - 0.035, 0, (h - 0.035) / 2, 0, mat(c.metal, { metalness: 0.5, roughness: 0.4 }), 16);
    cyl(g, w * 0.28, w * 0.3, 0.025, 0, 0.0125, 0, mat(c.metal, { metalness: 0.5, roughness: 0.4 }), 30);
  },
  table(g, w, d, h, c) {
    const wood = mat(c.wood);
    box(g, w, 0.04, d, 0, h - 0.02, 0, wood, 0.01);
    legs(g, w, d, h - 0.04, 0.07, 0.025, wood, true);
    cyl(g, 0.07, 0.05, 0.2, 0, h + 0.1, 0, mat(c.accent, { roughness: 0.4 }));
  },
  desk(g, w, d, h, c) {
    const wood = mat(c.wood), metal = mat(c.metal, { metalness: 0.6, roughness: 0.4 });
    box(g, w, 0.03, d, 0, h - 0.015, 0, wood, 0.008);
    for (const s of [-1, 1]) {
      box(g, 0.03, h - 0.03, 0.03, s * (w / 2 - 0.05), (h - 0.03) / 2, -d / 2 + 0.05, metal);
      box(g, 0.03, h - 0.03, 0.03, s * (w / 2 - 0.05), (h - 0.03) / 2, d / 2 - 0.05, metal);
    }
    box(g, 0.5, 0.3, 0.02, 0, h + 0.2, -d / 2 + 0.15, mat("#1a1a1a", { roughness: 0.3 }));
    box(g, 0.08, 0.05, 0.08, 0, h + 0.025, -d / 2 + 0.15, mat("#1a1a1a", { roughness: 0.3 }));
  },
  chair(g, w, d, h, c) {
    const wood = mat(c.wood), fab = mat(c.fabric, { roughness: 0.95 });
    const seatH = 0.46;
    legs(g, w, d, seatH - 0.03, 0.03, 0.014, wood, true);
    box(g, w, 0.05, d, 0, seatH - 0.025, 0, fab, 0.015);
    box(g, w, h - seatH, 0.03, 0, seatH + (h - seatH) / 2, -d / 2 + 0.03, wood, 0.01);
  },
  stool(g, w, d, h, c) {
    cyl(g, w / 2, w / 2, 0.05, 0, h - 0.025, 0, mat(c.wood), 20);
    legs(g, w * 0.8, w * 0.8, h - 0.05, 0.02, 0.012, mat(c.metal, { metalness: 0.6, roughness: 0.35 }));
  },
  shelf(g, w, d, h, c) {
    const wood = mat(c.wood);
    for (const s of [-1, 1]) box(g, 0.02, h, d, s * (w / 2 - 0.01), h / 2, 0, wood);
    box(g, w, h, 0.01, 0, h / 2, -d / 2 + 0.005, wood);
    const n = Math.max(2, Math.round(h / 0.36));
    const pal = [c.accent, c.accent2, c.fabric, c.wood, "#e8e2d4"];
    for (let i = 0; i <= n; i++) {
      const y = 0.02 + (h - 0.04) * (i / n);
      box(g, w - 0.04, 0.02, d, 0, y, 0, wood);
      if (i < n) {
        let x = -w / 2 + 0.04;
        for (let k = 0; x < w / 2 - 0.12; k++) {
          const bw = 0.025 + ((i * 7 + k * 3) % 5) * 0.008, bh = 0.2 + ((i + k) % 4) * 0.025;
          if ((i + k) % 6 === 5) { x += 0.08; continue; }
          box(g, bw, bh, d * 0.7, x + bw / 2, y + 0.01 + bh / 2, 0.02, mat(pal[(i + k) % pal.length], { roughness: 0.9 }));
          x += bw + 0.004;
        }
      }
    }
  },
  "tv-unit"(g, w, d, h, c) {
    builders.cabinet(g, w, d, h, c);
    box(g, Math.min(1.45, w * 0.8), 0.82, 0.04, 0, h + 0.45, -d / 2 + 0.1, mat("#111111", { roughness: 0.25, metalness: 0.2 }));
    box(g, 0.3, 0.02, 0.18, 0, h + 0.01, -d / 2 + 0.1, mat("#222222"));
  },
  counter(g, w, d, h, c) {
    const body = mat(c.wood), top = mat(c.accent2, { roughness: 0.4 });
    box(g, w, 0.1, d - 0.05, 0, 0.05, -0.025, mat("#2a2a2a"));
    box(g, w, h - 0.14, d - 0.02, 0, 0.1 + (h - 0.14) / 2, 0, body, 0.005);
    box(g, w + 0.01, 0.04, d + 0.01, 0, h - 0.02, 0, top, 0.005);
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) box(g, 0.004, h - 0.18, 0.004, -w / 2 + (w / n) * i, 0.1 + (h - 0.14) / 2, d / 2, mat("#000000", { opacity: 0.3 }));
  },
  fridge(g, w, d, h, c) {
    const body = mat("#e9e9e6", { roughness: 0.35, metalness: 0.3 });
    box(g, w, h, d, 0, h / 2, 0, body, 0.02);
    box(g, w - 0.02, 0.005, 0.005, 0, h * 0.62, d / 2, mat("#000000", { opacity: 0.3 }));
    for (const y of [h * 0.45, h * 0.75]) box(g, 0.02, 0.3, 0.03, w / 2 - 0.08, y, d / 2 + 0.015, mat(c.metal, { metalness: 0.8, roughness: 0.25 }));
  },
  bathtub(g, w, d, h, c) {
    const white = mat("#f7f7f5", { roughness: 0.2 });
    box(g, w, h, d, 0, h / 2, 0, white, 0.06);
    box(g, w - 0.14, 0.02, d - 0.14, 0, h - 0.005, 0, mat("#cfe3ea", { roughness: 0.1, opacity: 0.85 }), 0.05);
  },
  shower(g, w, d, h, c) {
    box(g, w, 0.06, d, 0, 0.03, 0, mat("#f3f3f1", { roughness: 0.3 }));
    const glass = mat("#bfd8e0", { roughness: 0.05, opacity: 0.25 });
    box(g, w, h - 0.06, 0.01, 0, h / 2 + 0.03, d / 2, glass);
    box(g, 0.01, h - 0.06, d, w / 2, h / 2 + 0.03, 0, glass);
    cyl(g, 0.1, 0.1, 0.02, 0, h - 0.1, -d / 2 + 0.2, mat(c.metal, { metalness: 0.8, roughness: 0.2 }));
  },
  toilet(g, w, d, h, c) {
    const white = mat("#f7f7f5", { roughness: 0.2 });
    box(g, w, h - 0.4, 0.18, 0, 0.4 + (h - 0.4) / 2, -d / 2 + 0.09, white, 0.03);
    box(g, w * 0.8, 0.4, d - 0.2, 0, 0.2, 0.08, white, 0.12);
  },
  vanity(g, w, d, h, c) {
    builders.cabinet(g, w, d, h - 0.05, c);
    box(g, w, 0.05, d, 0, h - 0.025, 0, mat("#f7f7f5", { roughness: 0.2 }), 0.01);
    box(g, w * 0.7, 0.7, 0.02, 0, h + 0.55, -d / 2 + 0.01, mat("#cfdde2", { roughness: 0.05, metalness: 0.6 }));
  },
  rug(g, w, d, h, c) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat("#ffffff", { roughness: 1, map: rugTexture(c.accent2, c.accent, false) }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.receiveShadow = true;
    g.add(m);
  },
  "rug-round"(g, w, d, h, c) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 48), mat("#ffffff", { roughness: 1, map: rugTexture(c.accent2, c.accent, true) }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.receiveShadow = true;
    g.add(m);
  },
  lamp(g, w, d, h, c) {
    const metal = mat(c.metal, { metalness: 0.6, roughness: 0.35 });
    cyl(g, w * 0.4, w * 0.45, 0.03, 0, 0.015, 0, metal, 24);
    cyl(g, 0.012, 0.012, h - 0.3, 0, (h - 0.3) / 2, 0, metal, 8);
    const shade = new THREE.MeshStandardMaterial({ color: "#f3ead8", emissive: "#ffd9a0", emissiveIntensity: 0.6, roughness: 1, side: THREE.DoubleSide });
    cyl(g, w * 0.35, w / 2, 0.32, 0, h - 0.16, 0, shade, 24);
    const bulb = new THREE.PointLight("#ffd6a0", 0.8, 4, 2);
    bulb.position.set(0, h - 0.2, 0);
    g.add(bulb);
  },
  plant(g, w, d, h, c) {
    cyl(g, w * 0.32, w * 0.25, h * 0.25, 0, h * 0.125, 0, mat(c.accent2, { roughness: 0.8 }), 18);
    const leaf = mat("#4f7a4a", { roughness: 0.9 }), leaf2 = mat("#3f6a3d", { roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(w * (0.28 + (i % 3) * 0.05), 0), i % 2 ? leaf : leaf2);
      const a = i * 2.4, r = i ? w * 0.18 : 0;
      s.position.set(Math.cos(a) * r, h * (0.45 + (i / 7) * 0.45), Math.sin(a) * r);
      s.castShadow = true;
      g.add(s);
    }
  },
  mirror(g, w, d, h, c) {
    box(g, w, h, d, 0, h / 2 + 0.05, 0, mat(c.wood), 0.01);
    box(g, w - 0.06, h - 0.06, 0.005, 0, h / 2 + 0.05, d / 2, mat("#d6e2e6", { roughness: 0.02, metalness: 0.95 }));
  }
};

export function buildFurniture(shape, wCm, dCm, hCm, colors) {
  const g = new THREE.Group();
  const fn = builders[shape] || ((gg, w, d, h, c) => box(gg, w, h, d, 0, h / 2, 0, mat(c.wood), 0.01));
  fn(g, wCm / 100, dCm / 100, hCm / 100, colors);
  return g;
}

export const SHAPES = Object.keys(builders);
