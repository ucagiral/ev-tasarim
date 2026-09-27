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
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("dialog", (d) => d.type() === "prompt" ? d.accept("Yeni ad") : d.accept());
await page.route("https://cdn.jsdelivr.net/npm/three@*/**", async (route) => {
  const u = new URL(route.request().url());
  const rel = u.pathname.replace(/^\/npm\/three@[^/]+\//, "");
  route.fulfill({ path: join(ROOT, "node_modules", "three", rel), contentType: "text/javascript" });
});

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
