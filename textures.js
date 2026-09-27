// Zemin dokuları: canvas'a çizilir, dışarıdan görsel indirilmez. Her doku 2 m × 2 m'lik
// bir karoyu temsil eder; zemin geometrisinin UV'leri metre cinsinden olduğundan
// tekrar = 0.5.

import * as THREE from "three";

const SIZE = 512;          // piksel
export const TILE_M = 2;   // bir doku karosunun gerçek boyu (m)
const PX_PER_CM = SIZE / (TILE_M * 100);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function noise(ctx, rand, amount, alpha) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rand() - 0.5) * amount;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
    d[i + 3] = 255 * (alpha ?? 1);
  }
  ctx.putImageData(img, 0, 0);
}

function grain(ctx, rand, x, y, w, h, color) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
  const horizontal = w >= h;
  const n = Math.max(4, Math.round((horizontal ? h : w) / 3));
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    if (horizontal) {
      const yy = y + rand() * h;
      ctx.moveTo(x, yy);
      for (let xx = x; xx <= x + w; xx += 16) ctx.lineTo(xx, yy + Math.sin(xx / 30 + i) * 1.5);
    } else {
      const xx = x + rand() * w;
      ctx.moveTo(xx, y);
      for (let yy = y; yy <= y + h; yy += 16) ctx.lineTo(xx + Math.sin(yy / 30 + i) * 1.5, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const painters = {
  wood(ctx, c1, c2, rand) {
    const plankW = 20 * PX_PER_CM, plankL = 120 * PX_PER_CM;
    for (let row = 0; row * plankW < SIZE; row++) {
      const offset = (row % 3) * plankL / 3;
      for (let x = -offset; x < SIZE; x += plankL) {
        const k = 0.9 + rand() * 0.2;
        ctx.fillStyle = shade(rand() < 0.5 ? c1 : c2, k);
        ctx.fillRect(x, row * plankW, plankL, plankW);
        grain(ctx, rand, x, row * plankW, plankL, plankW, shade(c2, 0.6));
        ctx.fillStyle = shade(c2, 0.55);
        ctx.fillRect(x, row * plankW, 1.5, plankW);
      }
      ctx.fillStyle = shade(c2, 0.55);
      ctx.fillRect(0, row * plankW, SIZE, 1.5);
    }
  },
  herringbone(ctx, c1, c2, rand) {
    const w = 10 * PX_PER_CM, l = 50 * PX_PER_CM;
    ctx.fillStyle = c2; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let gy = -l; gy < SIZE + l; gy += w * 2) {
      for (let gx = -l * 2; gx < SIZE + l; gx += l + w) {
        for (const dir of [0, 1]) {
          ctx.save();
          const x = gx + (dir ? l : 0), y = gy + (dir ? 0 : 0);
          ctx.translate(x, y);
          ctx.rotate(dir ? -Math.PI / 4 : Math.PI / 4);
          ctx.fillStyle = shade(rand() < 0.5 ? c1 : c2, 0.9 + rand() * 0.2);
          ctx.fillRect(0, 0, l, w);
          grain(ctx, rand, 0, 0, l, w, shade(c2, 0.6));
          ctx.strokeStyle = shade(c2, 0.5); ctx.lineWidth = 1.2; ctx.strokeRect(0, 0, l, w);
          ctx.restore();
        }
      }
    }
  },
  tile(ctx, c1, c2, rand) {
    const t = 25 * PX_PER_CM;
    for (let y = 0; y < SIZE; y += t) for (let x = 0; x < SIZE; x += t) {
      ctx.fillStyle = shade(rand() < 0.5 ? c1 : c2, 0.92 + rand() * 0.16);
      ctx.fillRect(x, y, t, t);
    }
    noise(ctx, rand, 14);
    ctx.fillStyle = shade(c1, 1.35);
    for (let i = 0; i < SIZE; i += t) { ctx.fillRect(i, 0, 2, SIZE); ctx.fillRect(0, i, SIZE, 2); }
  },
  stone(ctx, c1, c2, rand) {
    const t = 60 * PX_PER_CM;
    for (let y = 0; y < SIZE; y += t / 2) for (let x = ((y / (t / 2)) % 2) * t / 2 - t; x < SIZE; x += t) {
      ctx.fillStyle = shade(rand() < 0.5 ? c1 : c2, 0.9 + rand() * 0.2);
      ctx.fillRect(x, y, t, t / 2);
    }
    noise(ctx, rand, 26);
    ctx.fillStyle = shade(c2, 0.8);
    for (let y = 0; y < SIZE; y += t / 2) ctx.fillRect(0, y, SIZE, 1.5);
  },
  concrete(ctx, c1, c2, rand) {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = shade(c2, 0.9 + rand() * 0.2); ctx.globalAlpha = 0.08;
      ctx.beginPath(); ctx.arc(rand() * SIZE, rand() * SIZE, 20 + rand() * 80, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    noise(ctx, rand, 18);
  },
  terrazzo(ctx, c1, c2, rand) {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = shade(rand() < 0.5 ? c2 : c1, 0.5 + rand() * 0.9);
      ctx.beginPath(); ctx.arc(rand() * SIZE, rand() * SIZE, 1 + rand() * 4, 0, Math.PI * 2); ctx.fill();
    }
  },
  carpet(ctx, c1, c2, rand) {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, SIZE, SIZE);
    noise(ctx, rand, 30);
  }
};

const cache = new Map();

export function floorTexture(floor) {
  const key = `${floor.type}|${floor.color}|${floor.color2}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  (painters[floor.type] || painters.concrete)(ctx, floor.color, floor.color2 || floor.color, rng(7));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / TILE_M, 1 / TILE_M);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

// Halı deseni: kenar bordürü + stil vurgu rengi.
export function rugTexture(c1, c2, round) {
  const key = `rug|${c1}|${c2}|${round}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = c1; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = c2; ctx.lineWidth = 14;
  if (round) { ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke(); }
  else { ctx.strokeRect(18, 18, 220, 220); ctx.lineWidth = 3; ctx.strokeRect(40, 40, 176, 176); }
  const rand = rng(3);
  const img = ctx.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (rand() - 0.5) * 22; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
