// Motor kurallarının gerçekten tuttuğunu kanıtlar, tuttuğuna inanmak yerine.
//
// Çalıştır:  node tools/selftest.mjs
//
// engine.js'yi — tarayıcının yüklediği aynı dosyayı — yükler ve sentetik bir evle
// sınar. Ağ yok, tarayıcı yok.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
new Function(readFileSync(join(ROOT, "engine.js"), "utf8"))();
const E = globalThis.EvEngine;

const catalog = JSON.parse(readFileSync(join(ROOT, "data", "furniture.json"), "utf8")).items;
const styleIds = JSON.parse(readFileSync(join(ROOT, "styles", "index.json"), "utf8")).styles;
const styles = styleIds.map((id) => JSON.parse(readFileSync(join(ROOT, "styles", id + ".json"), "utf8")));

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    const problem = fn();
    if (problem) failures.push(`${name}\n    ${problem}`);
    else passed++;
  } catch (e) {
    failures.push(`${name}\n    fırlattı: ${e.stack}`);
  }
}
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- test evi
// Salon 400×300 (0,0)'da, yatak odası 300×300 sağında bitişik; aralarında ortak duvar
// (x=400) ve o duvarda salon tarafından tanımlanmış bir kapı.
function house() {
  const p = E.emptyProject({ variant: "v1" });
  p.rooms.push({ id: "r1", name: "Salon", kind: "salon", height: 260, points: E.rectPoints(0, 0, 400, 300), openings: [] });
  p.rooms.push(E.newRectRoom(p, "r2", "Yatak", "yatak", 300, 300, 260));
  // Salonun 1. duvarı (400,0)→(400,300): ortak duvar.
  p.rooms[0].openings.push({ id: "d1", type: "door", wall: 1, offset: 150, width: 90, height: 210, sill: 0 });
  // Salonun 2. duvarı (400,300)→(0,300): pencere.
  p.rooms[0].openings.push({ id: "w1", type: "window", wall: 2, offset: 200, width: 120, height: 140, sill: 90 });
  return p;
}

// ---------------------------------------------------------------- geometri
check("dikdörtgen alanı ve çevresi", () => {
  const pts = E.rectPoints(0, 0, 400, 300);
  if (!near(E.areaM2(pts), 12)) return `alan ${E.areaM2(pts)}`;
  if (!near(E.perimeter(pts), 1400)) return `çevre ${E.perimeter(pts)}`;
});

check("L odanın alanı", () => {
  const L = [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:100,y:100},{x:100,y:200},{x:0,y:200}];
  if (!near(E.area(L), 30000)) return `alan ${E.area(L)}`;
});

check("içeri bakan normal, çokgenin yönünden bağımsız", () => {
  const cw = { points: E.rectPoints(0, 0, 400, 300) };
  const ccw = { points: E.rectPoints(0, 0, 400, 300).slice().reverse() };
  for (const r of [cw, ccw]) {
    for (const w of E.walls(r)) {
      const mid = { x: (w.a.x + w.b.x) / 2 + w.n.x * 10, y: (w.a.y + w.b.y) / 2 + w.n.y * 10 };
      if (!E.pointInPolygon(mid, r.points)) return `duvar ${w.index} normali dışarı bakıyor`;
    }
  }
});

check("kendini kesen çokgen yakalanır", () => {
  const bow = [{x:0,y:0},{x:100,y:100},{x:100,y:0},{x:0,y:100}];
  if (!E.selfIntersects(bow)) return "papyon kesişim sayılmadı";
  if (E.selfIntersects(E.rectPoints(0, 0, 100, 100))) return "dikdörtgen kesişiyor sayıldı";
});

check("duvar uzatma dikdörtgeni dikdörtgen tutar", () => {
  const r = { points: E.rectPoints(0, 0, 400, 300) };
  const s = E.stretchWall(r, 0, 450);
  const lens = E.walls(s).map((w) => Math.round(w.length));
  if (lens.join() !== "450,300,450,300") return `boylar ${lens}`;
  if (s.points[0].x !== 0 || s.points[0].y !== 0) return "başlangıç köşesi kıpırdadı";
});

check("duvar kısaltma L odada karşı duvarı da kaydırır, açıları korur", () => {
  const L = { points: [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:100,y:100},{x:100,y:200},{x:0,y:200}] };
  const s = E.stretchWall(L, 0, 250);
  const lens = E.walls(s).map((w) => Math.round(w.length));
  if (lens.join() !== "250,100,150,100,100,200") return `boylar ${lens}`;
  if (E.selfIntersects(s.points)) return "L bozuldu";
});

// ---------------------------------------------------------------- açıklıklar ve duvarlar
check("açıklık doğrulaması: taşma, tavan, çakışma", () => {
  const p = house(), r = p.rooms[0];
  if (E.openingProblems(r, r.openings[0]).length) return "geçerli kapı reddedildi: " + E.openingProblems(r, r.openings[0]);
  if (!E.openingProblems(r, { id: "x", type: "door", wall: 1, offset: 20, width: 90, height: 210 }).length) return "duvar başından taşan kapı kabul edildi";
  if (!E.openingProblems(r, { id: "x", type: "window", wall: 2, offset: 50, width: 60, height: 200, sill: 90 }).length) return "tavandan yüksek pencere kabul edildi";
  if (!E.openingProblems(r, { id: "x", type: "window", wall: 1, offset: 180, width: 60, height: 100, sill: 90 }).length) return "kapıyla çakışan pencere kabul edildi";
});

check("bitişik odalar ortak duvarı görür", () => {
  const p = house();
  const s = E.sharedSpans(p, 0, 1);
  if (s.length !== 1 || !near(s[0].s0, 0) || !near(s[0].s1, 300)) return JSON.stringify(s);
  if (E.sharedSpans(p, 0, 0).length) return "dış duvar ortak sayıldı";
});

check("ortak duvardaki kapı komşu odanın duvarını da deler", () => {
  const p = house();
  // Yatak odasının x=400 duvarı: (400,300)→(400,0), yani 3. duvar; kapı merkezi y=150.
  const ops = E.openingsOnWall(p, 1, 3);
  if (ops.length !== 1 || ops[0].own) return JSON.stringify(ops);
  if (!near(ops[0].s, 150)) return `konum ${ops[0].s}`;
  const pieces = E.wallPieces(p, 1, 3, 12);
  const hole = pieces.every((pc) => !(pc.s0 < 150 && pc.s1 > 150 && pc.z0 === 0));
  if (!hole) return "kapı boşluğu yatak odası duvarında yok";
});

check("ortak duvar yarım kalınlıkta, dış duvar tam kalınlıkta", () => {
  const p = house();
  const shared = E.wallPieces(p, 0, 1, 12);
  if (!shared.every((pc) => pc.depth === 6)) return "ortak duvar " + JSON.stringify(shared.map((x) => x.depth));
  const outer = E.wallPieces(p, 0, 0, 12);
  if (!outer.every((pc) => pc.depth === 12)) return "dış duvar kalınlığı yanlış";
});

check("pencere: denizlik ve lento parçaları, boşluk ortada", () => {
  const p = house();
  const pcs = E.wallPieces(p, 0, 2, 12);
  const sill = pcs.find((x) => x.kind === "denizlik"), lintel = pcs.find((x) => x.kind === "lento");
  if (!sill || sill.z1 !== 90) return "denizlik yok";
  if (!lintel || lintel.z0 !== 230 || lintel.z1 !== 260) return "lento yanlış";
  if (!near(sill.s1 - sill.s0, 120)) return `pencere genişliği ${sill.s1 - sill.s0}`;
});

check("dış köşede duvar uzar, iç köşede uzamaz", () => {
  const L = { id: "L", name: "L", height: 260, openings: [], points: [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:100,y:100},{x:100,y:200},{x:0,y:200}] };
  const p = { rooms: [L] };
  // Duvar 2: (200,100)→(100,100); başı dışbükey, sonu içbükey.
  const pcs = E.wallPieces(p, 0, 2, 10);
  const s0 = Math.min(...pcs.map((x) => x.s0)), s1 = Math.max(...pcs.map((x) => x.s1));
  if (s0 !== -10) return `baş uzaması ${s0}`;
  if (s1 !== 100) return `iç köşe uzadı: ${s1}`;
});

// ---------------------------------------------------------------- mobilya
check("dönük ayak izi: 90° dönünce en ve derinlik yer değiştirir", () => {
  const fp = E.footprint(100, 100, 200, 80, 90);
  const b = E.bbox(fp);
  if (!near(b.maxX - b.minX, 80) || !near(b.maxY - b.minY, 200)) return JSON.stringify(b);
});

check("çakışma: kesişen, değen ve uzak kutular", () => {
  const a = E.footprint(0, 0, 100, 100, 0);
  if (!E.convexOverlap(a, E.footprint(50, 50, 100, 100, 0))) return "kesişen yakalanmadı";
  if (E.convexOverlap(a, E.footprint(100, 0, 100, 100, 0))) return "değen çakışma sayıldı";
  if (E.convexOverlap(a, E.footprint(300, 0, 100, 100, 45))) return "uzak çakışma sayıldı";
  if (!E.convexOverlap(a, E.footprint(90, 0, 100, 100, 45))) return "dönük kesişen yakalanmadı";
});

check("yerleşim sorunları: dışarı taşma, çakışma, kapı önü; halı muaf", () => {
  const p = house();
  const v = { furniture: [
    { id: "a", type: "sofa3", x: 150, y: 50, rot: 0 },
    { id: "b", type: "armchair", x: 200, y: 60, rot: 0 },        // kanepeyle çakışır
    { id: "c", type: "bookshelf", x: 390, y: 150, rot: 90 },      // kapının önünde
    { id: "d", type: "coffee-table", x: -20, y: 150, rot: 0 },    // dışarı taşar
    { id: "e", type: "rug-large", x: 200, y: 150, rot: 0 }        // halı: kimseyle çakışmaz
  ] };
  const is = E.layoutIssues(p, v, catalog);
  const kinds = (id) => is.filter((x) => x.itemId === id).map((x) => x.kind).sort().join();
  if (kinds("a") !== "overlap") return `a: ${kinds("a")}`;
  if (kinds("b") !== "overlap") return `b: ${kinds("b")}`;
  if (!kinds("c").includes("door")) return `c: ${kinds("c")}`;
  if (!kinds("d").includes("outside")) return `d: ${kinds("d")}`;
  if (kinds("e") !== "") return `e: ${kinds("e")}`;
});

check("kapının açılma alanı iki tarafta da", () => {
  const z = E.doorZones(house());
  if (z.length !== 2) return `${z.length} alan`;
  const rooms = z.map((x) => x.roomIndex).sort().join();
  if (rooms !== "0,1") return rooms;
});

check("L odanın içbükey köşesini aşan mobilya dışarıda sayılır", () => {
  const L = { id: "L", name: "L", height: 260, openings: [], points: [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:100,y:100},{x:100,y:200},{x:0,y:200}] };
  const p = { rooms: [L] };
  const v = { furniture: [{ id: "x", type: "dining4", x: 120, y: 120, rot: 0 }] };
  if (!E.layoutIssues(p, v, catalog).some((i) => i.kind === "outside")) return "içbükey köşe aşımı yakalanmadı";
});

check("otomatik yerleşim: duvara dayalı, çakışmasız, arkası duvarda", () => {
  const p = house();
  let v = { furniture: [] };
  const placed = [];
  for (const [k, t] of ["sofa3", "tv-unit", "armchair", "bookshelf"].entries()) {
    const it = E.autoPlace(p, v, catalog, 0, { id: "f" + k, type: t, x: 0, y: 0, rot: 0 });
    if (!it) return `${t} yerleşemedi`;
    v = { furniture: v.furniture.concat([it]) };
    placed.push(it);
  }
  const is = E.layoutIssues(p, v, catalog);
  if (is.length) return JSON.stringify(is);
  // Kanepe en uzun duvara (y=0) dayanmalı, önü odaya (rot 0 → ön +y).
  const sofa = placed[0], d = E.dims(sofa, catalog);
  if (!near(sofa.y, d.d / 2 + 1, 0.2) || sofa.rot !== 0) return `kanepe ${JSON.stringify(sofa)}`;
});

check("otomatik yerleşim yer yoksa null döner, üst üste koymaz", () => {
  const p = { rooms: [{ id: "k", name: "Küçük", kind: "banyo", height: 250, openings: [], points: E.rectPoints(0, 0, 100, 100) }] };
  const it = E.autoPlace(p, { furniture: [] }, catalog, 0, { id: "x", type: "bed-double", x: 0, y: 0, rot: 0 });
  if (it !== null) return "sığmayan yatak yerleşti";
});

check("orta parçalar (halı, masa) odanın ortasına gelir", () => {
  const p = house();
  const it = E.autoPlace(p, { furniture: [] }, catalog, 0, { id: "t", type: "dining6", x: 0, y: 0, rot: 0 });
  const c = E.centroid(p.rooms[0].points);
  if (!it || Math.hypot(it.x - c.x, it.y - c.y) > 1) return JSON.stringify(it);
  // Uzun kenar en uzun duvara (yatay, 400 cm) paralel.
  if (it.rot % 180 !== 0) return `açı ${it.rot}`;
});

check("sandalyeler masanın çevresine, yüzü masaya dönük", () => {
  const p = house();
  let v = { furniture: [] };
  const table = E.autoPlace(p, v, catalog, 0, { id: "t", type: "dining4", x: 0, y: 0, rot: 0 });
  v = { furniture: [table] };
  for (let k = 0; k < 4; k++) {
    const ch = E.autoPlace(p, v, catalog, 0, { id: "c" + k, type: "chair", x: 0, y: 0, rot: 0 });
    if (!ch) return `sandalye ${k} yerleşmedi`;
    v = { furniture: v.furniture.concat([ch]) };
    const r = ch.rot * Math.PI / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) };
    const toTable = { x: table.x - ch.x, y: table.y - ch.y };
    if (front.x * toTable.x + front.y * toTable.y <= 0) return `sandalye ${k} masaya arkasını dönmüş: ${JSON.stringify(ch)}`;
    if (Math.hypot(toTable.x, toTable.y) > 120) return `sandalye ${k} masadan uzak`;
  }
  if (E.layoutIssues(p, v, catalog).length) return JSON.stringify(E.layoutIssues(p, v, catalog));
});

check("yuvarlak masada sandalyeler de masaya dönük", () => {
  const p = house();
  const table = E.autoPlace(p, { furniture: [] }, catalog, 0, { id: "t", type: "dining-round", x: 0, y: 0, rot: 0 });
  let v = { furniture: [table] };
  for (let k = 0; k < 3; k++) {
    const ch = E.autoPlace(p, v, catalog, 0, { id: "c" + k, type: "chair", x: 0, y: 0, rot: 0 });
    v = { furniture: v.furniture.concat([ch]) };
    const r = ch.rot * Math.PI / 180;
    const cosang = (-Math.sin(r) * (table.x - ch.x) + Math.cos(r) * (table.y - ch.y)) / Math.hypot(table.x - ch.x, table.y - ch.y);
    if (cosang < 0.99) return `sandalye ${k} tam dönük değil (${cosang.toFixed(3)})`;
  }
});

check("katalog ipuçları var olan parçalara işaret ediyor", () => {
  for (const c of catalog) {
    for (const t of c.pairsWith || []) if (!E.catalogItem(catalog, t)) return `${c.id} → ${t}`;
    if (c.place && c.place !== "center") return `${c.id}: place ${c.place}`;
  }
});

check("stil seti: sığmayanlar atlanır ve söylenir", () => {
  const p = { rooms: [{ id: "k", name: "Dar", kind: "yatak", height: 250, openings: [], points: E.rectPoints(0, 0, 220, 240) }] };
  const style = styles.find((s) => s.id === "iskandinav");
  const ids = style.sets.yatak.map((_, k) => "s" + k);
  const res = E.applyStyleSet(p, { furniture: [] }, catalog, style, 0, ids);
  if (!res.placed.includes("bed-double")) return "yatak yerleşmedi";
  if (res.placed.length + res.skipped.length !== style.sets.yatak.length) return "sayılar tutmuyor";
  if (E.layoutIssues(p, res.variant, catalog).length) return "yerleşen set sorunlu";
});

// ---------------------------------------------------------------- stiller ve renk
check("bütün stiller şemaya uyuyor ve katalogdaki parçaları kullanıyor", () => {
  const probs = styles.flatMap((s) => E.styleProblems(s, catalog));
  if (probs.length) return probs.join("\n    ");
  if (styles.length < 12) return `yalnız ${styles.length} stil`;
});

check("stil dosyası adı kimliğiyle aynı", () => {
  const files = readdirSync(join(ROOT, "styles")).filter((f) => f !== "index.json");
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(ROOT, "styles", f), "utf8"));
    if (s.id + ".json" !== f) return `${f} → ${s.id}`;
    if (!styleIds.includes(s.id)) return `${s.id} index.json'da yok`;
  }
});

check("katalogda kimlik tekrar etmiyor, ölçüler pozitif", () => {
  const seen = new Set();
  for (const c of catalog) {
    if (seen.has(c.id)) return `tekrar: ${c.id}`;
    seen.add(c.id);
    if (!(c.w > 0 && c.d > 0 && c.h > 0)) return `${c.id} ölçü`;
  }
});

check("renk sıcaklığı: sıcak ışık kırmızımsı, 6600 K beyaza yakın", () => {
  const warm = E.kelvinToRgb(2700), d65 = E.kelvinToRgb(6600);
  if (!(warm.r === 255 && warm.b < warm.g && warm.g < 255)) return JSON.stringify(warm);
  if (!(d65.r > 250 && d65.g > 240 && d65.b > 240)) return JSON.stringify(d65);
});

check("elle verilen renk stil paletini ezer", () => {
  const style = styles[0];
  if (E.itemColor({ colors: { fabric: "#123456" } }, catalog, style, "fabric") !== "#123456") return "elle renk kaybedildi";
  if (E.itemColor({}, catalog, style, "fabric") !== style.palette.fabric) return "palet okunmadı";
});

// ---------------------------------------------------------------- proje
check("geçerli proje doğrulanır", () => {
  const errs = E.validateProject(house(), catalog);
  if (errs.length) return errs.join("; ");
});

check("üst üste binen odalar reddedilir, bitişikler kabul", () => {
  const p = house();
  p.rooms.push({ id: "r3", name: "Taşan", kind: "salon", height: 260, points: E.rectPoints(350, 100, 200, 100), openings: [] });
  if (!E.validateProject(p, catalog).some((e) => e.includes("üst üste"))) return "çakışan oda yakalanmadı";
});

check("tamamen içeride kalan oda da üst üste sayılır", () => {
  const p = house();
  p.rooms.push({ id: "r3", name: "İç", kind: "salon", height: 260, points: E.rectPoints(100, 100, 50, 50), openings: [] });
  if (!E.validateProject(p, catalog).some((e) => e.includes("üst üste"))) return "iç içe oda yakalanmadı";
});

check("tekrar eden kimlik reddedilir", () => {
  const p = house();
  p.variants[0].furniture.push({ id: "r1", type: "chair", x: 50, y: 50, rot: 0 });
  if (!E.validateProject(p, catalog).some((e) => e.includes("tekrar"))) return "tekrar yakalanmadı";
});

check("oda silinince içindeki mobilya bütün varyantlardan gider", () => {
  const p = house();
  p.variants[0].furniture = [{ id: "a", type: "chair", x: 50, y: 50, rot: 0 }, { id: "b", type: "chair", x: 500, y: 50, rot: 0 }];
  const q = E.removeRoom(p, "r1", catalog);
  const ids = q.variants[0].furniture.map((f) => f.id).join();
  if (ids !== "b") return ids;
  if (q.rooms.length !== 1) return "oda silinmedi";
});

check("varyant çoğaltma yeni kimlik verir, stil ve konumu korur", () => {
  const v = { id: "v1", name: "A", styleId: "bohem", furniture: [{ id: "a", type: "chair", x: 1, y: 2, rot: 90 }] };
  const d = E.duplicateVariant(v, "v2", "B", (k) => "n" + k);
  if (d.furniture[0].id !== "n0" || d.furniture[0].x !== 1 || d.styleId !== "bohem") return JSON.stringify(d);
  if (v.furniture[0].id !== "a") return "asıl varyant değişti";
});

check("özet: oda alanları ve toplam", () => {
  const s = E.summary(house());
  if (s.totalM2 !== 21) return JSON.stringify(s);
});

// ---------------------------------------------------------------- referans katmanları
check("katman türü uzantıdan ve .ply başlığından", () => {
  const cases = [
    ["oda.usdz", "", "mesh"], ["ev.GLB", "", "mesh"], ["a.obj", "", "mesh"], ["s.spz", "", "splat"],
    ["s.splat", "", "splat"], ["n.ply", "ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x", "mesh"],
    ["g.ply", "ply\nelement vertex 9\nproperty float x\nproperty float f_dc_0\nproperty float opacity", "splat"],
    ["resim.jpg", "", null]
  ];
  for (const [n, h, want] of cases) if (E.layerKind(n, h) !== want) return `${n}: ${E.layerKind(n, h)} ≠ ${want}`;
});

check("katman dönüşümü: metre → cm, döndürme 3B ile aynı yönde", () => {
  const t = { x: 100, y: 50, rot: 90, scale: 1, elev: 0 };
  const p = E.layerToPlan(t, { x: 1, z: 0 });
  // Planda saat yönünde 90°: yerel +x → plan +y. 3B'de rotation.y = -90° aynı yeri verir.
  if (!near(p.x, 100) || !near(p.y, 150)) return JSON.stringify(p);
  const q = E.layerToPlan({ ...t, rot: 0, scale: 2 }, { x: 1, z: 1 });
  if (!near(q.x, 300) || !near(q.y, 250)) return JSON.stringify(q);
  const f = E.layerToPlan({ ...t, rot: 0, flip: true }, { x: 1, z: 1 });
  if (!near(f.x, 200) || !near(f.y, -50)) return `ters çevrilmiş ${JSON.stringify(f)}`;
});

check("katmanı ortalama kutunun ortasını hedefe getirir", () => {
  const box = { minX: 2, maxX: 6, minZ: -1, maxZ: 3 };
  for (const rot of [0, 37, 180]) {
    const t = E.centerLayerOn({ x: 0, y: 0, rot, scale: 1, elev: 0 }, box, { x: 400, y: 300 });
    const b = E.layerPlanBox(t, box);
    if (!near((b.minX + b.maxX) / 2, 400, 0.2) || !near((b.minY + b.maxY) / 2, 300, 0.2)) return `rot ${rot}: ${JSON.stringify(b)}`;
  }
});

check("katman dönüşümü doğrulaması", () => {
  if (E.layerTransformProblems(E.defaultLayerTransform()).length) return "varsayılan geçersiz";
  if (!E.layerTransformProblems({ x: 0, y: 0, rot: 0, scale: 0, elev: 0 }).length) return "sıfır ölçek kabul edildi";
  if (!E.layerTransformProblems({ x: NaN, y: 0, rot: 0, scale: 1, elev: 0 }).length) return "NaN kabul edildi";
});

check("kabartma ızgarası 0–1'e normalleşir, köşeleri korur", () => {
  const w = 4, h = 2, data = Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 110]);
  const g = E.reliefGrid(data, w, h, 4, 2);
  if (g[0] !== 0 || g[7] !== 1) return Array.from(g).join();
  if (!near(g[3], 30 / 100)) return `sağ üst ${g[3]}`;
  const flat = E.reliefGrid(new Uint8Array(8).fill(7), 4, 2, 3, 3);
  if (Array.from(flat).some((v) => v !== 0)) return "düz görüntü sıfır değil";
});

// ---------------------------------------------------------------- fotoğraftan oda
// Sentetik kamera: kapı çerçevesinde (X duvar boyunca, Y yukarı, Z odaya) bir konumdan bir
// hedefe bakar. Kapıyı ve zemin köşelerini görüntüye izdüşürüp motordan geri isteriz.
function lookAtPose(C, target) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  const fwd = norm(sub(target, C));
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
  const down = cross(fwd, right);
  // R sütunları: kapı eksenlerinin kamera koordinatındaki karşılıkları.
  const R = [{ x: right.x, y: down.x, z: fwd.x }, { x: right.y, y: down.y, z: fwd.y }, { x: right.z, y: down.z, z: fwd.z }];
  const t = { x: -(right.x * C.x + right.y * C.y + right.z * C.z), y: -(down.x * C.x + down.y * C.y + down.z * C.z), z: -(fwd.x * C.x + fwd.y * C.y + fwd.z * C.z) };
  return { R, t };
}
const IMG = { w: 4032, h: 3024 };           // iPhone 12 MP yatay
const F35 = 26;                              // iPhone 16 Plus ana kamera (1x)
const UW = 13;                               // ultra geniş (0.5x)
const camFor = (f35) => ({ f: E.focalPx(f35, IMG.w, IMG.h), cx: IMG.w / 2, cy: IMG.h / 2 });
const CAM = camFor(F35);
// Oda: X −100…280, Z 0…420; kapı X 0…85, yükseklik 205.
const DOOR = { w: 85, h: 205 };
function shoot(C, target, floor3d, f35 = F35) {
  const pose = lookAtPose(C, target);
  const cam = camFor(f35);
  const pr = (P) => E.projectPoint(pose, cam, P);
  const door = [pr({ x: 0, y: 0, z: 0 }), pr({ x: DOOR.w, y: 0, z: 0 }), pr({ x: DOOR.w, y: DOOR.h, z: 0 }), pr({ x: 0, y: DOOR.h, z: 0 })];
  const floor = floor3d.map((P) => pr({ x: P.x, y: 0, z: P.z }));
  for (const p of [...door, ...floor]) if (p.z <= 0 || p.x < 0 || p.y < 0 || p.x > IMG.w || p.y > IMG.h) return { offscreen: p };
  return { door: door.map(({ x, y }) => ({ x, y })), floor: floor.map(({ x, y }) => ({ x, y })) };
}

check("odak uzaklığı: 26 mm karşılığı 4032×3024'te ~3100 px", () => {
  const f = E.focalPx(26, 4032, 3024);
  if (!near(f, 26 * 5040 / Math.hypot(36, 24), 0.01)) return `${f}`;
  if (f < 3000 || f > 3200) return `${f}`;
});

check("homografi dört noktayı birebir eşler", () => {
  const src = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const dst = [{ x: 100, y: 900 }, { x: 400, y: 880 }, { x: 390, y: 200 }, { x: 110, y: 150 }];
  const H = E.homography4(src, dst);
  for (let i = 0; i < 4; i++) { const q = E.applyH(H, src[i]); if (!near(q.x, dst[i].x, 1e-6) || !near(q.y, dst[i].y, 1e-6)) return JSON.stringify(q); }
});

check("kapıdan poz: kamera konumu ve kapı genişliği geri gelir", () => {
  const C = { x: 150, y: 140, z: 380 };
  const s = shoot(C, { x: 60, y: 110, z: 0 }, []);
  if (s.offscreen) return "kapı kadraj dışında";
  const shuffled = [s.door[2], s.door[0], s.door[3], s.door[1]]; // dokunma sırası önemsiz
  const pose = E.poseFromDoor(shuffled, CAM, DOOR.h);
  if (pose.error) return pose.error;
  if (!near(pose.C.x, C.x, 0.5) || !near(pose.C.y, C.y, 0.5) || !near(pose.C.z, C.z, 0.5)) return JSON.stringify(pose.C);
  if (!near(pose.doorWidth, DOOR.w, 0.3)) return `kapı eni ${pose.doorWidth}`;
});

check("zemin noktası ışın–zemin kesişimiyle geri gelir", () => {
  const C = { x: 150, y: 140, z: 380 };
  const P = { x: -100, z: 0 };
  const s = shoot(C, { x: 60, y: 110, z: 0 }, [P]);
  const pose = E.poseFromDoor(s.door, CAM, DOOR.h);
  const q = E.floorPointFromPixel(pose, CAM, s.floor[0]);
  if (!near(q.x, P.x, 0.5) || !near(q.z, P.z, 0.5)) return JSON.stringify(q);
});

// Üç köşe ve kapı aynı karede ancak 0.5x lensle sığıyor: 1x'in yatay yarım açısı ~33°.
const THREE_CORNERS = [{ x: 260, y: 150, z: 400 }, { x: 180, y: 70, z: 300 }, [{ x: -100, z: 0 }, { x: 280, z: 0 }, { x: -100, z: 420 }], UW];

check("1x lensle kapı ve üç köşe aynı kareye sığmıyor (0.5x önerisinin gerekçesi)", () => {
  const s = shoot(...THREE_CORNERS.slice(0, 3), F35);
  if (!s.offscreen) return "1x'te de sığdı; öneri metni gözden geçirilmeli";
});

check("fotoğraftan oda: karşı köşeden, üç köşe görünür (gürültüsüz ±1 cm)", () => {
  const s = shoot(...THREE_CORNERS);
  if (s.offscreen) return "kadraj dışı: " + JSON.stringify(s.offscreen);
  const r = E.roomFromPhoto({ door: s.door, floor: s.floor, image: IMG, f35: UW, doorHeight: DOOR.h });
  if (r.error) return r.error;
  if (!near(r.width, 380, 1) || !near(r.depth, 420, 1)) return `${r.width} × ${r.depth}`;
  if (!near(r.doorOffset, 100 + DOOR.w / 2, 1)) return `kapı konumu ${r.doorOffset}`;
  if (r.warnings.length) return r.warnings.join("; ");
});

check("fotoğraftan oda: kapıya bakarak, köşede durarak (derinlik kameradan)", () => {
  const s = shoot({ x: 270, y: 145, z: 410 }, { x: 40, y: 80, z: 0 }, [{ x: -100, z: 0 }, { x: 280, z: 0 }]);
  if (s.offscreen) return "kadraj dışı: " + JSON.stringify(s.offscreen);
  const noCorner = E.roomFromPhoto({ door: s.door, floor: s.floor, image: IMG, f35: F35, doorHeight: DOOR.h });
  if (!near(noCorner.width, 380, 1)) return `en ${noCorner.width}`;
  const r = E.roomFromPhoto({ door: s.door, floor: s.floor, image: IMG, f35: F35, doorHeight: DOOR.h, cameraInCorner: true });
  if (!near(r.depth, 410, 1)) return `derinlik ${r.depth}`;
});

check("derinlik yoksa söylenir, uydurulmaz", () => {
  const s = shoot({ x: 90, y: 150, z: 300 }, { x: 90, y: 80, z: 0 }, [{ x: -100, z: 0 }, { x: 280, z: 0 }]);
  if (s.offscreen) return "kadraj dışı";
  const r = E.roomFromPhoto({ door: s.door, floor: s.floor, image: IMG, f35: F35, doorHeight: DOOR.h });
  if (!r.warnings.some((w) => w.includes("derinli"))) return JSON.stringify(r.warnings);
});

check("ufkun üstüne dokunulan zemin köşesi reddedilir", () => {
  const s = shoot({ x: 150, y: 140, z: 380 }, { x: 60, y: 110, z: 0 }, []);
  const r = E.roomFromPhoto({ door: s.door, floor: [{ x: IMG.w / 2, y: 10 }], image: IMG, f35: F35, doorHeight: DOOR.h });
  if (!r.error || !r.error.includes("ufuk")) return JSON.stringify(r);
});

check("±2 px dokunma hatasında belirsizlik aralığı gerçek ölçüyü kapsar", () => {
  const s = shoot(...THREE_CORNERS);
  const rand = E.seededRandom(42);
  const noisy = (p) => ({ x: p.x + (rand() * 4 - 2), y: p.y + (rand() * 4 - 2) });
  const input = { door: s.door.map(noisy), floor: s.floor.map(noisy), image: IMG, f35: UW, doorHeight: DOOR.h };
  const sp = E.photoRoomSpread(input, E.seededRandom(7), 60, 3);
  if (!sp) return "aralık yok";
  if (!(sp.width[0] <= 380 && sp.width[1] >= 380)) return `en ${sp.width}`;
  if (!(sp.depth[0] <= 420 && sp.depth[1] >= 420)) return `derinlik ${sp.depth}`;
  if (sp.width[1] - sp.width[0] > 120) return `aralık çok geniş: ${sp.width}`;
});

// ---------------------------------------------------------------- taramadan oda
// Sentetik tarama: 3.8 × 4.2 × 2.6 m oda; zemin, tavan, dört duvar (biri seyrek), bir
// dolap, gürültü ve pencereden dışarı kaçan aykırı noktalar. Sonra bütünü rastgele
// döndürülür ve 8° yatırılır (telefon eğik tutulmuş gibi).
function syntheticScan(seed, { tilt = 8, yaw = 27, sparseWall = true } = {}) {
  const rand = E.seededRandom(seed), pts = [];
  const W = 3.8, D = 4.2, Hh = 2.6, noise = () => (rand() - 0.5) * 0.02;
  const push = (x, y, z) => pts.push(x + noise(), y + noise(), z + noise());
  for (let i = 0; i < 20000; i++) push(rand() * W, 0, rand() * D);                 // zemin
  for (let i = 0; i < 8000; i++) push(rand() * W, Hh, rand() * D);                  // tavan
  for (let i = 0; i < 9000; i++) push(rand() * W, rand() * Hh, 0);                  // duvarlar
  for (let i = 0; i < 9000; i++) push(0, rand() * Hh, rand() * D);
  for (let i = 0; i < 9000; i++) push(W, rand() * Hh, rand() * D);
  for (let i = 0; i < (sparseWall ? 900 : 9000); i++) push(rand() * W, rand() * Hh, D);
  for (let i = 0; i < 3000; i++) push(1 + rand() * 1.2, rand() * 1.9, 3.6 + rand() * 0.6); // dolap
  for (let i = 0; i < 150; i++) push(W + 0.5 + rand() * 3, 0.8 + rand() * 1.2, rand() * D); // pencereden dışarı
  // Döndür (yaw, y ekseni) ve yatır (tilt, x ekseni), sonra ortala.
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  const ct = Math.cos(tilt * Math.PI / 180), st = Math.sin(tilt * Math.PI / 180);
  const out = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i += 3) {
    let x = pts[i] - W / 2, y = pts[i + 1] - 1.3, z = pts[i + 2] - D / 2;
    [x, z] = [cy * x + sy * z, -sy * x + cy * z];
    [y, z] = [ct * y - st * z, st * y + ct * z];
    out[i] = x; out[i + 1] = y; out[i + 2] = z;
  }
  return out;
}

check("taramadan oda: eğik ve dönük taramada en, derinlik, tavan ±5 cm", () => {
  const r = E.roomFromPointCloud(syntheticScan(3), { rand: E.seededRandom(9) });
  if (r.error) return r.error;
  const dims = [r.width, r.depth].sort((a, b) => a - b);
  if (!near(dims[0], 380, 5) || !near(dims[1], 420, 5)) return `${r.width.toFixed(1)} × ${r.depth.toFixed(1)}`;
  if (!near(r.height, 260, 5)) return `tavan ${r.height}`;
});

check("taramadan oda: seyrek duvar uyarısı, sık duvarda uyarı yok", () => {
  const sparse = E.roomFromPointCloud(syntheticScan(4), { rand: E.seededRandom(2) });
  if (!sparse.warnings.some((w) => w.includes("az görünüyor"))) return "seyrek duvar söylenmedi: " + sparse.warnings;
  const full = E.roomFromPointCloud(syntheticScan(5, { sparseWall: false }), { rand: E.seededRandom(2) });
  if (full.warnings.length) return full.warnings.join("; ");
});

check("taramadan oda: az nokta reddedilir", () => {
  const r = E.roomFromPointCloud(new Float32Array(300), {});
  if (!r.error) return "kabul edildi";
});

check("kapı köşeleri: eğik çekilmiş kapıda sıralama doğru", () => {
  // Kapı yandan: sol kenar kısa ve yüksekte, sağ kenar uzun; sağ-üst köşe sol-alttan aşağıda.
  const bl = { x: 100, y: 500 }, br = { x: 400, y: 900 }, tr = { x: 420, y: 80 }, tl = { x: 110, y: 380 };
  const k = E.sortRectCorners([tr, bl, tl, br]);
  if (k.bl !== bl || k.br !== br || k.tr !== tr || k.tl !== tl) return JSON.stringify(k);
});

// ---------------------------------------------------------------- Depth Anything 3 demosu
// Demonun kodundaki (gradio_app.py) olay bağları: handle_uploads iki olaya bağlı (video ve
// görsel), gradio_demo 11 girdili. view_api bunları bu adlarla döndürür.
const DA3_API = {
  named_endpoints: {
    "/handle_uploads": { parameters: [{}, {}, {}] },
    "/handle_uploads_1": { parameters: [{}, {}, {}] },
    "/clear_fields": { parameters: [] },
    "/update_log": { parameters: [] },
    "/gradio_demo": { parameters: new Array(11).fill({}) },
    "/measure": { parameters: [{}, {}, {}] }
  }
};

check("DA3 demosu: uçlar canlı arayüzden seçilir", () => {
  const e = E.da3Endpoints(DA3_API);
  if (e.error || e.upload !== "/handle_uploads" || e.run !== "/gradio_demo") return JSON.stringify(e);
  const onlySuffixed = { named_endpoints: { "/handle_uploads_1": { parameters: [{}, {}, {}] }, "/gradio_demo_2": { parameters: new Array(11).fill({}) } } };
  const e2 = E.da3Endpoints(onlySuffixed);
  if (e2.upload !== "/handle_uploads_1" || e2.run !== "/gradio_demo_2") return JSON.stringify(e2);
});

check("DA3 demosu: arayüz değişmişse sessizce yanlış çağırmaz", () => {
  if (!E.da3Endpoints({ named_endpoints: { "/predict": { parameters: [] } } }).error) return "uç yokken kabul edildi";
  const changed = { named_endpoints: { "/handle_uploads": { parameters: [{}, {}, {}] }, "/gradio_demo": { parameters: new Array(12).fill({}) } } };
  if (!E.da3Endpoints(changed).error) return "parametre sayısı değişmişken kabul edildi";
});

check("DA3 demosu: gradio_demo argümanları demodaki sırayla ve 11 tane", () => {
  const a = E.da3RunArgs("/tmp/x");
  if (a.length !== 11 || a[0] !== "/tmp/x" || a[1] !== false || a[4] !== "upper_bound_resize" || a[7] !== false) return JSON.stringify(a);
});

check("DA3 demosu: yayındaki demonun varsayılanları kullanılır, kamera ve splat kapalı", () => {
  // Yayındaki demo: process_res_method seçenekleri high_res/low_res (gerçek hata mesajından).
  const params = new Array(11).fill(null).map(() => ({ parameter_has_default: false }));
  params[1] = { type: "boolean", parameter_has_default: true, parameter_default: true };
  params[4] = { type: "", parameter_has_default: true, parameter_default: "high_res" };
  params[7] = { type: "boolean", parameter_has_default: true, parameter_default: true };
  const a = E.da3RunArgs("/d", params);
  if (a[4] !== "high_res") return `process_res ${a[4]}`;
  if (a[1] !== false || a[7] !== false) return "kamera ya da splat açık kaldı";
  if (a[5] !== 30) return "varsayılanı olmayan girdi koddaki değere düşmedi";
});

check("DA3 demosu: 'seçenek listesinde yok' hatasından düzeltme", () => {
  const args = E.da3RunArgs("/d");
  const fixed = E.da3FixChoice(args, "Value: upper_bound_resize is not in the list of choices: ['high_res', 'low_res']");
  if (!fixed || fixed[4] !== "high_res" || fixed[0] !== "/d") return JSON.stringify(fixed);
  if (E.da3FixChoice(args, "GPU quota exceeded") !== null) return "ilgisiz hata düzeltme sandı";
  if (E.da3FixChoice(args, "Value: nope is not in the list of choices: ['a']") !== null) return "olmayan değeri değiştirdi";
});

// ---------------------------------------------------------------- sonuç
console.log(`${passed} geçti, ${failures.length} kaldı`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "✗ " + f).join("\n"));
  process.exit(1);
}
