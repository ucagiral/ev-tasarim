// Uygulamayı gerçek bir tarayıcıda açar ve temel akışları sürer: örnek ev yüklenir,
// stil değişir, mobilya eklenip sürüklenir, oda eklenir ve çizilir, varyantlar
// karşılaştırılır, geri alınır. Konsol hatası ya da sayfa hatası testi düşürür.
//
// Çalıştır:  npm i && node tools/smoke.mjs      (ekran görüntüleri shots/ altına)
//
// three.js CDN'den yüklenir; test onu node_modules'tan verir, ağ gerekmez.

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "shots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  // Derinlik adımında bilerek engellenen model indirmesi hata olarak sayılmaz.
  if (m.type() === "error" && !/huggingface|Failed to fetch|net::ERR_FAILED|Derinlik|\(sahte\)/i.test(m.text())) errors.push("console: " + m.text());
});
page.on("dialog", (d) => d.type() === "prompt" ? d.accept("Yeni ad") : d.accept());
// CDN'deki paketleri node_modules'tan ver: /npm/<paket>@<sürüm>/<yol>
await page.route("https://cdn.jsdelivr.net/npm/**", async (route) => {
  const u = new URL(route.request().url());
  const m = /^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/.exec(u.pathname);
  if (!m) return route.abort();
  route.fulfill({ path: join(ROOT, "node_modules", m[1], m[2]), contentType: m[2].endsWith(".wasm") ? "application/wasm" : "text/javascript" });
});
// Model dosyaları bu ortamdan indirilemez; derinlik adımı hata yolunu sınar.
await page.route("https://huggingface.co/**", (route) => route.abort());

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log("✓", name); }
  catch (e) { failed++; console.log("✗", name, "\n   ", e.message); }
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const assert = (c, m) => { if (!c) throw new Error(m); };

await page.goto(base);
await page.waitForFunction(() => window.__ev && window.__ev.S.project, null, { timeout: 20000 });
await page.waitForTimeout(1500);

// Fotoğraf eklenince otomatik oda (Depth Anything 3) bu ortamda çalışamaz (huggingface.co
// kapalı); onu sınayan adım dışında kapatılır.
await page.addInitScript(() => { window.__evNoAutoRoom = true; });
await ev(() => { window.__evNoAutoRoom = true; });

await step("örnek ev açılır, geçerli ve sorunsuz", async () => {
  const r = await ev(() => { const { S, E } = window.__ev; const v = E.activeVariant(S.project); return { rooms: S.project.rooms.length, items: v.furniture.length, errs: E.validateProject(S.project, S.catalog), issues: E.layoutIssues(S.project, v, S.catalog) }; });
  assert(r.rooms === 4, `${r.rooms} oda`);
  assert(r.items > 10, `${r.items} parça`);
  assert(!r.errs.length, r.errs.join());
  assert(!r.issues.length, JSON.stringify(r.issues));
  await page.screenshot({ path: join(SHOTS, "1-split.png") });
});

await step("3B tuval çiziliyor (boş değil)", async () => {
  const lit = await ev(() => {
    const c = document.querySelector("#view canvas");
    const g = c.getContext("webgl2") || c.getContext("webgl");
    const px = new Uint8Array(4 * 100);
    g.readPixels(c.width / 2 - 50, c.height / 2, 100, 1, g.RGBA, g.UNSIGNED_BYTE, px);
    const set = new Set();
    for (let i = 0; i < px.length; i += 4) set.add(px[i] + "," + px[i + 1] + "," + px[i + 2]);
    return set.size;
  });
  assert(lit > 5, `yalnız ${lit} farklı renk`);
});

await step("stil değişir", async () => {
  await page.click("#tabs [data-tab=styles]");
  await page.click(".style-card[data-id=bohem]");
  const id = await ev(() => window.__ev.E.activeVariant(window.__ev.S.project).styleId);
  assert(id === "bohem", id);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "2-bohem.png") });
});

await step("mobilya eklenir ve seçilir", async () => {
  await ev(() => window.__ev.api.select({ kind: "room", id: window.__ev.S.project.rooms[0].id }));
  await page.click("#tabs [data-tab=furniture]");
  const before = await ev(() => window.__ev.E.activeVariant(window.__ev.S.project).furniture.length);
  await page.click("[data-act=add-item][data-type=side-table]");
  const r = await ev(() => ({ n: window.__ev.E.activeVariant(window.__ev.S.project).furniture.length, sel: window.__ev.S.selection }));
  assert(r.n === before + 1, `${before} → ${r.n}`);
  assert(r.sel && r.sel.kind === "item", JSON.stringify(r.sel));
});

await step("planda sürükleme mobilyayı taşır ve geri alınır", async () => {
  const id = await ev(() => window.__ev.S.selection.id);
  const el = page.locator(`.plan-svg g[data-id="${id}"] rect`);
  const b = await el.boundingBox();
  const start = await ev((i) => window.__ev.E.activeVariant(window.__ev.S.project).furniture.find((f) => f.id === i), id);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const moved = await ev((i) => window.__ev.E.activeVariant(window.__ev.S.project).furniture.find((f) => f.id === i), id);
  assert(moved.x !== start.x || moved.y !== start.y, "yer değişmedi");
  await page.keyboard.press("Control+z");
  const back = await ev((i) => window.__ev.E.activeVariant(window.__ev.S.project).furniture.find((f) => f.id === i), id);
  assert(back.x === start.x && back.y === start.y, "geri alınmadı");
});

await step("R döndürür, Delete siler", async () => {
  await page.locator(".plan-svg").focus();
  const id = await ev(() => window.__ev.S.selection.id);
  await page.keyboard.press("r");
  const rot = await ev((i) => window.__ev.E.activeVariant(window.__ev.S.project).furniture.find((f) => f.id === i).rot, id);
  assert(rot % 90 === 0 && rot !== undefined, `açı ${rot}`);
  await page.keyboard.press("Delete");
  const gone = await ev((i) => !window.__ev.E.activeVariant(window.__ev.S.project).furniture.some((f) => f.id === i), id);
  assert(gone, "silinmedi");
});

await step("dikdörtgen oda eklenir ve bitişik konur", async () => {
  await page.click("#tabs [data-tab=rooms]");
  await page.fill("#new-name", "Çalışma");
  await page.selectOption("#new-kind", "calisma");
  await page.click("[data-act=add-rect]");
  const r = await ev(() => { const { S, E } = window.__ev; const room = S.project.rooms.at(-1); return { name: room.name, errs: E.validateProject(S.project, S.catalog), shared: S.project.rooms.map((_, i) => i).some((i) => E.walls(room).some((w) => E.sharedSpans(S.project, S.project.rooms.length - 1, w.index).length)) }; });
  assert(r.name === "Çalışma", r.name);
  assert(!r.errs.length, r.errs.join());
  assert(r.shared, "ortak duvar yok");
});

await step("duvar boyu yazılınca oda uzar", async () => {
  await page.fill("#wl-0", "500");
  await page.press("#wl-0", "Enter");
  await page.locator("#wl-0").blur();
  const L = await ev(() => { const { S, E } = window.__ev; return Math.round(E.wall(S.project.rooms.at(-1), 0).length); });
  assert(L === 500, `${L}`);
});

await step("kapı ve pencere eklenir", async () => {
  await page.click("[data-act=add-window][data-wall='0']");
  await page.click("#tabs [data-tab=rooms]");
  await page.click("[data-act=add-door][data-wall='2']");
  const n = await ev(() => window.__ev.S.project.rooms.at(-1).openings.length);
  assert(n === 2, `${n} açıklık`);
});

await step("üst üste binen oda çizimi reddedilir", async () => {
  const before = await ev(() => window.__ev.S.project.rooms.length);
  await ev(() => window.__ev.api.createRoomFromPoints([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]));
  const after = await ev(() => window.__ev.S.project.rooms.length);
  assert(after === before, `${before} → ${after}`);
});

await step("planda çizerek oda eklenir", async () => {
  await page.click("[data-act=draw]");
  const svg = await page.locator(".plan-svg").boundingBox();
  // Planın sol altında boş bir yer: mevcut odaların altı.
  // Ekrandaki odaların altındaki boşluğa tıkla.
  const floors = await page.locator(".room-floor").all();
  let maxY = 0, minX = Infinity;
  for (const f of floors) { const bb = await f.boundingBox(); maxY = Math.max(maxY, bb.y + bb.height); minX = Math.min(minX, bb.x); }
  const y0 = Math.min(maxY + 30, svg.y + svg.height - 70);
  const pts = [[minX, y0], [minX + 120, y0], [minX + 120, y0 + 50], [minX, y0 + 50]];
  for (const [x, y] of pts) { await page.mouse.click(x, y); }
  await page.keyboard.press("Enter");
  const n = await ev(() => window.__ev.S.project.rooms.length);
  assert(n === 6, `${n} oda`);
});

await step("varyant çoğaltılır ve iki varyant karşılaştırılır", async () => {
  await page.click("#tabs [data-tab=variants]");
  await page.click("[data-act=dup-variant]");
  const ids = await ev(() => window.__ev.S.project.variants.map((v) => v.id));
  assert(ids.length === 3, `${ids.length} varyant`);
  const boxes = page.locator("[data-act=compare-pick]");
  await boxes.nth(0).check();
  await page.locator("[data-act=compare-pick]").nth(1).check();
  await page.click("[data-act=compare]");
  await page.waitForSelector("dialog[open] .compare img");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, "3-compare.png") });
  await page.click("dialog[open] button.primary");
});

await step("yalnız 3B ve yalnız 2B görünüm", async () => {
  await page.click("[data-layout='3d']");
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "4-3d.png") });
  await page.click("[data-layout=plan]");
  await page.click("#fit");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "5-plan.png") });
  await page.click("[data-layout=split]");
});

await step("3B model katmanı (GLB) yüklenir, planda altlık olur", async () => {
  const r = await ev(async () => {
    const THREE = await import("three");
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    // 4×3 m'lik, 2.5 m yüksek duvarlı bir "tarama"
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const wall = (w, d, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, d), m); b.position.set(x, 1.25, z); g.add(b); };
    wall(4, 0.1, 2, 0); wall(4, 0.1, 2, 3); wall(0.1, 3, 0, 1.5); wall(0.1, 3, 4, 1.5);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.02, 3), m); floor.position.set(2, 0, 1.5); g.add(floor);
    const glb = await new GLTFExporter().parseAsync(g, { binary: true });
    await window.__ev.addLayerFile(new File([glb], "tarama.glb"));
    const L = window.__ev.S.layers.at(-1);
    return { err: L.error, box: L.box, image: !!L.image, t: L.transform };
  });
  assert(!r.err, r.err);
  assert(Math.abs(r.box.maxX - r.box.minX - 4.1) < 0.01, JSON.stringify(r.box));
  assert(r.image, "altlık görüntüsü yok");
  await page.waitForTimeout(400);
  assert(await page.locator(".plan-svg .underlay image").count() === 1, "planda altlık yok");
  await page.click("#tabs [data-tab=layers]");
  await page.fill(`[data-act=layer-t][data-field=rot]`, "30");
  await page.press(`[data-act=layer-t][data-field=rot]`, "Enter");
  await page.locator(`[data-act=layer-t][data-field=rot]`).blur();
  const rot = await ev(() => window.__ev.S.layers.at(-1).transform.rot);
  assert(rot === 30, `açı ${rot}`);
  await page.screenshot({ path: join(SHOTS, "8-layer.png") });
});

await step("LiDAR biçimi (USDZ) yüklenir", async () => {
  const r = await ev(async () => {
    const THREE = await import("three");
    const { USDZExporter } = await import("three/addons/exporters/USDZExporter.js");
    const scene = new THREE.Scene();
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
    b.position.set(1.5, 1.2, 0);
    scene.add(b);
    const usdz = await new USDZExporter().parseAsync(scene);
    await window.__ev.addLayerFile(new File([usdz], "roomplan.usdz"));
    const L = window.__ev.S.layers.at(-1);
    return { err: L.error, w: L.box && L.box.maxX - L.box.minX };
  });
  assert(!r.err, r.err);
  assert(Math.abs(r.w - 3) < 0.01, `en ${r.w}`);
});

await step("video splat'i (.ply, Gaussian) yüklenir ve 3B'de çizilir", async () => {
  // 3DGS .ply: x y z, f_dc_0..2, opacity, scale_0..2, rot_0..3 — hepsi float32.
  const N = 400, props = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${N}\n${props.map((p) => `property float ${p}`).join("\n")}\nend_header\n`;
  const body = new Float32Array(N * props.length);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    body.set([Math.cos(a), (i % 20) / 10, Math.sin(a), 1.2, -0.5, -0.5, 3, -3.5, -3.5, -3.5, 1, 0, 0, 0], i * props.length);
  }
  const bytes = [...new TextEncoder().encode(header), ...new Uint8Array(body.buffer)];
  const r = await ev(async (arr) => {
    await window.__ev.addLayerFile(new File([new Uint8Array(arr)], "video.ply"));
    const L = window.__ev.S.layers.at(-1);
    return { err: L.error, kind: L.kind, box: L.box };
  }, bytes);
  assert(r.kind === "splat", r.kind);
  assert(!r.err, r.err);
  assert(r.box && r.box.maxX > 0.9, JSON.stringify(r.box));
  await page.click("[data-layout='3d']");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "9-splat.png") });
  await page.click("[data-layout=split]");
});

await step("katmanlar yeniden yüklemede geri gelir", async () => {
  await page.reload();
  await page.waitForFunction(() => window.__ev && window.__ev.S.layers.length === 3 && window.__ev.S.layers.every((L) => L.box || L.error), null, { timeout: 20000 });
  const r = await ev(() => window.__ev.S.layers.map((L) => ({ n: L.name, e: L.error, rot: L.transform.rot })));
  assert(r.every((x) => !x.e), JSON.stringify(r));
  assert(r.find((x) => x.n === "tarama.glb").rot === 30, "dönüşüm kaybolmuş: " + JSON.stringify(r));
});

await step("fotoğraf eklenir; derinlik modeli indirilemezse anlaşılır hata", async () => {
  await page.click("#tabs [data-tab=photos]");
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 48;
    const g = c.getContext("2d"); g.fillStyle = "#8a6"; g.fillRect(0, 0, 64, 48);
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  await page.setInputFiles("#photo-input", { name: "oda.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForSelector(".photo img");
  await page.click(".photo .depth-btn");
  await page.waitForFunction(() => /çıkarılamadı/.test(document.getElementById("depth-status")?.textContent || ""), null, { timeout: 30000 });
  await page.click("dialog[open] button.primary");
});

await step("boş projede (oda yokken) fotoğraf eklenebilir", async () => {
  await ev(() => { document.querySelector(".menu").open = true; });
  await page.click("#new-project");
  await page.click("#tabs [data-tab=photos]");
  assert(await page.locator("#photo-input").count() === 1, "fotoğraf seçici yok");
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 40; c.height = 30;
    c.getContext("2d").fillRect(0, 0, 40, 30);
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  const before = await ev(() => window.__ev.S.photos.length);
  await page.setInputFiles("#photo-input", { name: "salon.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForFunction((n) => window.__ev.S.photos.length === n + 1, before);
});

await step("Tarama seçicisine verilen fotoğraf fotoğraf panosuna gider", async () => {
  await page.click("#tabs [data-tab=layers]");
  const before = await ev(() => window.__ev.S.photos.length);
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 20; c.height = 20;
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  await page.setInputFiles("#layer-input", { name: "IMG_0001.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForFunction((n) => window.__ev.S.photos.length === n + 1, before);
  assert(await ev(() => window.__ev.S.tab) === "photos", "fotoğraf sekmesine geçmedi");
});

await step("sürükle-bırak ile fotoğraf eklenir", async () => {
  const before = await ev(() => window.__ev.S.photos.length);
  await ev(async () => {
    const c = document.createElement("canvas"); c.width = 20; c.height = 20;
    const blob = await new Promise((r) => c.toBlob(r));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "birakilan.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction((n) => window.__ev.S.photos.length === n + 1, before);
});

await step("taramadan oda: scene.glb bırakılınca oda kendiliğinden çıkar", async () => {
  // Depth Anything 3 çıktısını taklit eden nokta bulutu: 3.8 × 4.2 × 2.6 m, eğik ve dönük.
  await ev(async () => {
    const THREE = await import("three");
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const rand = window.__ev.E.seededRandom(5), pts = [];
    const W = 3.8, D = 4.2, H = 2.6, nz = () => (rand() - 0.5) * 0.02, add = (x, y, z) => pts.push(x + nz(), y + nz(), z + nz());
    for (let i = 0; i < 15000; i++) add(rand() * W, 0, rand() * D);
    for (let i = 0; i < 6000; i++) add(rand() * W, H, rand() * D);
    for (let i = 0; i < 6000; i++) { add(rand() * W, rand() * H, 0); add(0, rand() * H, rand() * D); add(W, rand() * H, rand() * D); add(rand() * W, rand() * H, D); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const cloud = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.01 }));
    cloud.rotation.set(0.12, 0.5, 0); cloud.position.set(-1.9, -1.3, -2.1);
    const glb = await new GLTFExporter().parseAsync(cloud, { binary: true });
    const dt = new DataTransfer();
    dt.items.add(new File([glb], "scene.glb", { type: "model/gltf-binary" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForSelector("#sr-add", { timeout: 30000 });
  const txt = await ev(() => ({ w: document.getElementById("sr-w").textContent, d: document.getElementById("sr-d").textContent, h: document.getElementById("sr-h").textContent }));
  await page.screenshot({ path: join(SHOTS, "11-scan-room.png") });
  const dims = [parseInt(txt.w), parseInt(txt.d)].sort((a, b) => a - b);
  assert(Math.abs(dims[0] - 380) <= 6 && Math.abs(dims[1] - 420) <= 6, JSON.stringify(txt));
  assert(Math.abs(parseInt(txt.h) - 260) <= 6, JSON.stringify(txt));
  const before = await ev(() => window.__ev.S.project.rooms.length);
  await page.click("#sr-add");
  const r = await ev(() => { const x = window.__ev.S.project.rooms.at(-1); return { n: window.__ev.S.project.rooms.length, est: x.estimate && x.estimate.source }; });
  assert(r.n === before + 1 && r.est === "scan", JSON.stringify(r));
});

await step("otomatik: fotoğraflar eklenince oda kendiliğinden oluşur (sahte DA3 yanıtıyla)", async () => {
  // Demo yerine, gönderilen fotoğrafları sayıp 3.6 × 4.8 × 2.7 m'lik bir odanın nokta
  // bulutunu GLB olarak döndüren sahte yeniden kurucu.
  await ev(() => {
    window.__evNoAutoRoom = false;
    window.__evReconstruct = async (photos, status) => {
      window.__evSent = photos.length;
      status("sahte: 3B hesaplanıyor");
      const THREE = await import("three");
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      const rand = window.__ev.E.seededRandom(11), pts = [];
      const W = 3.6, D = 4.8, H = 2.7, nz = () => (rand() - 0.5) * 0.02, add = (x, y, z) => pts.push(x + nz(), y + nz(), z + nz());
      for (let i = 0; i < 15000; i++) add(rand() * W, 0, rand() * D);
      for (let i = 0; i < 6000; i++) add(rand() * W, H, rand() * D);
      for (let i = 0; i < 6000; i++) { add(rand() * W, rand() * H, 0); add(0, rand() * H, rand() * D); add(W, rand() * H, rand() * D); add(rand() * W, rand() * H, D); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const cloud = new THREE.Points(g, new THREE.PointsMaterial());
      cloud.rotation.set(-0.1, 0.9, 0.05);
      return new Blob([await new GLTFExporter().parseAsync(cloud, { binary: true })]);
    };
  });
  await page.click("#tabs [data-tab=photos]");
  await page.selectOption("#photo-room", "");
  const before = await ev(() => window.__ev.S.project.rooms.length);
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 48;
    c.getContext("2d").fillRect(0, 0, 64, 48);
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  const files = [1, 2, 3].map((i) => ({ name: `IMG_${i}.png`, mimeType: "image/png", buffer: Buffer.from(png) }));
  await page.setInputFiles("#photo-input", files);
  await page.waitForFunction((n) => window.__ev.S.project.rooms.length === n + 1, before, { timeout: 30000 });
  // Oda eklendikten sonra fotoğraflar ona bağlanır ve pencere kapanır.
  await page.waitForFunction(() => { const x = window.__ev.S.project.rooms.at(-1); return window.__ev.S.photos.filter((p) => p.roomId === x.id).length === 3 && !document.getElementById("modal").open; }, null, { timeout: 15000 });
  const r = await ev(() => { const { S, E } = window.__ev; const x = S.project.rooms.at(-1); return { w: E.wall(x, 0).length, d: E.wall(x, 1).length, h: x.height, est: x.estimate, sent: window.__evSent, photos: S.photos.filter((p) => p.roomId === x.id).length }; });
  const dims = [r.w, r.d].sort((a, b) => a - b);
  assert(Math.abs(dims[0] - 360) <= 6 && Math.abs(dims[1] - 480) <= 6, JSON.stringify(r));
  assert(Math.abs(r.h - 270) <= 6, `tavan ${r.h}`);
  assert(r.est && r.est.source === "photos" && r.sent === 3 && r.photos === 3, JSON.stringify(r));
  assert(!(await ev(() => document.getElementById("modal").open)), "pencere açık kaldı");
  await page.screenshot({ path: join(SHOTS, "12-auto-room.png") });
});

await step("otomatik: 'Bu fotoğraflardan oda oluştur' düğmesi kapı sormadan çalışır", async () => {
  assert(await page.locator("[data-act=room-photo]").count() === 0, "kapı aracı düğmesi hâlâ var");
  await page.click("#tabs [data-tab=photos]");
  await page.selectOption("#photo-room", "");
  const before = await ev(() => window.__ev.S.project.rooms.length);
  await ev(() => { window.__evNoAutoRoom = true; });
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 12; c.height = 12;
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  await page.setInputFiles("#photo-input", { name: "y.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForSelector("[data-act=auto-room]");
  await page.click("[data-act=auto-room]");
  await page.waitForFunction((n) => window.__ev.S.project.rooms.length === n + 1, before, { timeout: 30000 });
  assert(await page.locator(".pr-svg").count() === 0, "kapı işaretleme penceresi açıldı");
});

await step("otomatik: demo hata verirse nedeni ve Tekrar dene gösterilir", async () => {
  await ev(() => { window.__evNoAutoRoom = false; window.__evReconstruct = async () => { throw new Error("GPU kotası doldu (sahte)"); }; });
  await page.click("#tabs [data-tab=photos]");
  await page.selectOption("#photo-room", "");
  const png = await ev(async () => {
    const c = document.createElement("canvas"); c.width = 10; c.height = 10;
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r))).arrayBuffer()));
  });
  await page.setInputFiles("#photo-input", { name: "x.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForSelector("#ar-retry", { timeout: 15000 });
  assert(/GPU kotası/.test(await page.textContent("#auto-room")), "neden gösterilmedi");
  await page.click("dialog[open] button.primary:not(#ar-retry)");
  await ev(() => { window.__evNoAutoRoom = true; delete window.__evReconstruct; });
});

await step("kayıt yeniden yüklemede geri gelir", async () => {
  await page.waitForTimeout(600);
  const before = await ev(() => JSON.stringify(window.__ev.S.project.rooms.map((r) => r.name)));
  await page.reload();
  await page.waitForFunction(() => window.__ev && window.__ev.S.project);
  const after = await ev(() => JSON.stringify(window.__ev.S.project.rooms.map((r) => r.name)));
  assert(before === after, `${before} ≠ ${after}`);
});

await step("dar ekranda yatay kaydırma yok", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const over = await ev(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(SHOTS, "6-phone.png"), fullPage: true });
  assert(over <= 0, `${over}px taşıyor`);
});

await browser.close();
server.close();
if (errors.length) { failed++; console.log("✗ tarayıcı hataları:\n   " + [...new Set(errors)].join("\n   ")); }
console.log(failed ? `${failed} adım başarısız` : "hepsi geçti");
process.exit(failed ? 1 : 0);
