// Fotoğraftan derinlik (deneysel). Depth Anything V2 Small, transformers.js ile tamamen
// tarayıcıda çalışır; fotoğraf hiçbir sunucuya gitmez, yalnız model dosyaları bir kez
// Hugging Face'ten indirilir (~50 MB, tarayıcı önbelleğinde kalır). WebGPU varsa onunla,
// yoksa WebAssembly ile.
//
// Çıktı GÖRELİ derinliktir — fotoğrafı kabartma olarak gösterir, ölçü vermez.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const E = globalThis.EvEngine;
const MODEL = "onnx-community/depth-anything-v2-small";
let pipePromise = null;
let device = null;

async function getPipe(onStatus) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const progress = (p) => {
      if (p.status === "progress" && p.total) onStatus(`Model indiriliyor: %${Math.round((p.loaded / p.total) * 100)} (yalnız ilk seferde)`);
    };
    if (navigator.gpu) {
      try {
        const pipe = await pipeline("depth-estimation", MODEL, { device: "webgpu", progress_callback: progress });
        device = "WebGPU";
        return pipe;
      } catch (e) {
        console.warn("WebGPU ile açılmadı, WebAssembly deneniyor", e);
      }
    }
    const pipe = await pipeline("depth-estimation", MODEL, { device: "wasm", progress_callback: progress });
    device = "WebAssembly";
    return pipe;
  })();
  pipePromise.catch(() => { pipePromise = null; });
  return pipePromise;
}

export async function estimateDepth(blob, onStatus) {
  onStatus("Model yükleniyor…");
  const pipe = await getPipe(onStatus);
  onStatus(`Derinlik hesaplanıyor (${device})…`);
  const url = URL.createObjectURL(blob);
  try {
    const { depth } = await pipe(url);
    const ch = depth.channels || 1;
    let data = depth.data;
    if (ch > 1) {
      data = new Uint8Array(depth.width * depth.height);
      for (let i = 0; i < data.length; i++) data[i] = depth.data[i * ch];
    }
    return { data, width: depth.width, height: depth.height, device };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Fotoğrafı derinlik haritasıyla kabartılmış bir yüzey olarak gösterir.
export function reliefViewer(container, photoUrl, depth) {
  const w = container.clientWidth || 800, h = container.clientHeight || 500;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1b1a18");
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
  camera.position.set(0, 0, 2.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const aspect = depth.width / depth.height;
  const gw = 256, gh = Math.max(2, Math.round(gw / aspect));
  const grid = E.reliefGrid(depth.data, depth.width, depth.height, gw, gh);
  const geo = new THREE.PlaneGeometry(aspect, 1, gw - 1, gh - 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, grid[i] * 0.5);
  geo.computeVertexNormals();
  const tex = new THREE.TextureLoader().load(photoUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));

  let alive = true;
  (function loop() {
    if (!alive) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return () => { alive = false; geo.dispose(); tex.dispose(); renderer.dispose(); renderer.domElement.remove(); };
}
