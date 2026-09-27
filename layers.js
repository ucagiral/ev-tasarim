// Referans katmanları: LiDAR taraması (USDZ), 3B model (glTF/GLB, OBJ, .ply örgü) ve
// videodan üretilmiş Gaussian splat (.ply, .spz, .splat, .ksplat). Dosya tarayıcıda açılır,
// hiçbir yere yüklenmez. Katman evin kendisi değildir; üzerine plan çizilecek bir altlıktır.

import * as THREE from "three";

const E = globalThis.EvEngine;

async function plyHeader(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)));
  const end = head.indexOf("end_header");
  return end >= 0 ? head.slice(0, end) : head;
}

export async function detectKind(file) {
  if (E.fileExt(file.name) !== "ply") return E.layerKind(file.name, "");
  return E.layerKind(file.name, await plyHeader(await file.slice(0, 4096).arrayBuffer()));
}

// Katman kaydından sahneye konacak nesne. Dönen kutu yerel koordinatta (metre).
export async function buildLayerObject(layer) {
  const buf = await layer.blob.arrayBuffer();
  const ext = E.fileExt(layer.name);
  let obj;
  if (layer.kind === "splat") {
    const { SplatMesh } = await import("@sparkjsdev/spark");
    obj = new SplatMesh({ fileBytes: new Uint8Array(buf), fileName: layer.name });
    await obj.initialized;
    const box = obj.getBoundingBox(true);
    return { object: obj, box: boxOf(box), splat: true };
  }
  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, "", res, rej));
    obj = gltf.scene;
  } else if (ext === "usdz") {
    const { USDZLoader } = await import("three/addons/loaders/USDZLoader.js");
    obj = new USDZLoader().parse(buf);
  } else if (ext === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    obj = new OBJLoader().parse(new TextDecoder().decode(buf));
  } else if (ext === "ply") {
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    const geo = new PLYLoader().parse(buf);
    const colors = !!geo.getAttribute("color");
    if (geo.index) {
      geo.computeVertexNormals();
      obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: colors, color: colors ? 0xffffff : 0xbbbbbb, side: THREE.DoubleSide }));
    } else {
      obj = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.015, vertexColors: colors, color: colors ? 0xffffff : 0x888888 }));
    }
  } else {
    throw new Error("Bu dosya türü desteklenmiyor: ." + ext);
  }
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) throw new Error("Dosyada çizilecek bir şey bulunamadı.");
  return { object: obj, box: boxOf(box), splat: false };
}

function boxOf(b) {
  return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
}

// Katmanın sahnedeki sarmalayıcısı: plan dönüşümünü uygular.
export function wrap(object) {
  const inner = new THREE.Group();
  inner.add(object);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData.inner = inner;
  return outer;
}

export function applyTransform(outer, t) {
  outer.position.set(t.x / 100, t.elev / 100, t.y / 100);
  outer.rotation.set(0, -t.rot * Math.PI / 180, 0);
  outer.scale.setScalar(t.scale);
  outer.userData.inner.rotation.set(t.flip ? Math.PI : 0, 0, 0);
}

// Plan altlığı: modeli yukarıdan, bir kesit yüksekliğinin altını çizerek görüntüler
// (tavan kesilir, kesitteki duvarlar koyu, eşyalar gri, zemin neredeyse saydam). Kutu yerel koordinatta; görüntünün sol üstü
// (minX, minZ). Ters çevrilmiş katmanda kesit ters taraftan alınır. Blob URL döndürür.
export function topDownImage(renderer, object, box, flip) {
  const w = box.maxX - box.minX, d = box.maxZ - box.minZ;
  const px = 1024;
  const W = w >= d ? px : Math.max(64, Math.round(px * w / d));
  const H = w >= d ? Math.max(64, Math.round(px * d / w)) : px;
  const lowY = flip ? -box.maxY : box.minY, highY = flip ? -box.minY : box.maxY;
  const cut = lowY + Math.min(1.8, (highY - lowY) * 0.85);

  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.rotation.x = flip ? Math.PI : 0;
  holder.add(object.clone());
  scene.add(holder);
  scene.overrideMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { lo: { value: lowY }, hi: { value: cut } },
    vertexShader: "varying float vy; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vy = w.y; gl_Position = projectionMatrix * viewMatrix * w; }",
    // Kesitte kalan katı cisimlerin (duvar, dolap) içi görünür: arka yüzler koyu boyanır,
    // böylece kesit düzlemi dolu çizilir. Ön yüzler yüksekliğe göre açıktan koyuya.
    fragmentShader: "uniform float lo; uniform float hi; varying float vy; void main(){ if (!gl_FrontFacing) { gl_FragColor = vec4(0.1,0.1,0.12,1.0); return; } float k = clamp((vy-lo)/max(0.001,hi-lo),0.0,1.0); vec3 c = mix(vec3(0.86,0.84,0.8), vec3(0.3,0.3,0.33), smoothstep(0.2,1.0,k)); gl_FragColor = vec4(c, k < 0.12 ? 0.25 : 0.9); }"
  });
  const minZ = flip ? -box.maxZ : box.minZ, maxZ = flip ? -box.minZ : box.maxZ;
  const cam = new THREE.OrthographicCamera(box.minX, box.maxX, -minZ, -maxZ, 0.001, (cut - lowY) + 1);
  cam.position.set(0, cut, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, cut - 1, 0);
  // lookAt merkezi değiştirmesin diye kamera x/z = 0; sınırlar zaten dünya koordinatında.
  cam.updateProjectionMatrix();

  const rt = new THREE.WebGLRenderTarget(W, H);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const pixels = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  rt.dispose();
  scene.overrideMaterial.dispose();

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  // Render hedefi alttan yukarı okunur; görüntüyü dikey çevir.
  for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), "image/png"));
}
