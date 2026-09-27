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

// ---------------------------------------------------------------- sonuç
console.log(`${passed} geçti, ${failures.length} kaldı`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "✗ " + f).join("\n"));
  process.exit(1);
}
