// Ev tasarım motoru — bütün geometri ve kural mantığı, ekrana dokunan hiçbir şey yok.
//
// Bilerek modül değil düz bir script: uygulama <script> etiketiyle yükler (derleme adımı
// yok), tools/selftest.mjs aynı dosyayı node'da çalıştırır. Kuralların tek kopyası,
// çalıştığı yerde test edilir.
//
// Her fonksiyon verilen durumun saf fonksiyonudur. fetch yok, DOM yok, saat yok, rastgele
// yok — kimlikler (id) her zaman argüman olarak gelir.
//
// Birimler: santimetre. Plan koordinatları: x sağa, y aşağı (SVG ile aynı). 3B tarafı
// (x, y) → (x, 0, y) olarak kullanır; bu dosya 3B'yi bilmez.

(function (root) {
  "use strict";

  var EPS = 0.5; // cm — "aynı nokta / aynı doğru" toleransı

  // ------------------------------------------------------------------ vektör

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function mul(a, k) { return { x: a.x * k, y: a.y * k }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  function len(a) { return Math.hypot(a.x, a.y); }
  function norm(a) { var l = len(a); return l ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; }
  function round1(v) { return Math.round(v * 10) / 10; }

  function snap(v, step) { return step ? Math.round(v / step) * step : v; }

  // ------------------------------------------------------------------ çokgen

  // İşaretli alan (shoelace). İşaret yönü verir; mutlak değeri cm².
  function signedArea(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  function area(pts) { return Math.abs(signedArea(pts)); }
  function areaM2(pts) { return area(pts) / 10000; }

  function perimeter(pts) {
    var p = 0;
    for (var i = 0; i < pts.length; i++) p += len(sub(pts[(i + 1) % pts.length], pts[i]));
    return p;
  }

  function centroid(pts) {
    var A = signedArea(pts);
    if (Math.abs(A) < 1e-9) {
      var sx = 0, sy = 0;
      pts.forEach(function (p) { sx += p.x; sy += p.y; });
      return { x: sx / pts.length, y: sy / pts.length };
    }
    var cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var f = a.x * b.y - b.x * a.y;
      cx += (a.x + b.x) * f;
      cy += (a.y + b.y) * f;
    }
    return { x: cx / (6 * A), y: cy / (6 * A) };
  }

  function bbox(pts) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    pts.forEach(function (p) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y > b.maxY) b.maxY = p.y;
    });
    return b;
  }

  // Işın atma. Kenar üstündeki nokta "içeride" sayılır — mobilya duvara dayanabilmeli.
  function pointInPolygon(p, pts) {
    if (distToPolygonEdge(p, pts) <= EPS) return true;
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
          p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function distToSegment(p, a, b) {
    var ab = sub(b, a), L2 = dot(ab, ab);
    var t = L2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
    return len(sub(p, add(a, mul(ab, t))));
  }

  function distToPolygonEdge(p, pts) {
    var d = Infinity;
    for (var i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
    return d;
  }

  // İki doğru parçası birbirinin içinden geçiyor mu (uç noktada değmek sayılmaz).
  function segmentsCross(p1, p2, q1, q2) {
    var d1 = cross(sub(q2, q1), sub(p1, q1));
    var d2 = cross(sub(q2, q1), sub(p2, q1));
    var d3 = cross(sub(p2, p1), sub(q1, p1));
    var d4 = cross(sub(p2, p1), sub(q2, p1));
    var tol = 1e-6;
    return ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) &&
           ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol));
  }

  // Kenarları kendini kesen çokgen oda olamaz.
  function selfIntersects(pts) {
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (Math.abs(i - j) === 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  // Çokgen A, çokgen B'nin tamamen içinde mi (B içbükey olabilir).
  function polygonInside(inner, outer) {
    for (var i = 0; i < inner.length; i++) if (!pointInPolygon(inner[i], outer)) return false;
    for (i = 0; i < inner.length; i++) {
      for (var j = 0; j < outer.length; j++) {
        if (segmentsCross(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length])) return false;
      }
    }
    // Kenar çakışmadan içbükey köşeyi aşan durum: kenar orta noktaları da içeride olmalı.
    for (i = 0; i < inner.length; i++) {
      var m = mul(add(inner[i], inner[(i + 1) % inner.length]), 0.5);
      if (!pointInPolygon(m, outer)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ oda ve duvar

  function rectPoints(x, y, w, d) {
    return [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + d }, { x: x, y: y + d }];
  }

  // Duvar i: points[i] → points[i+1]. n içeri bakan birim normal.
  function wall(room, i) {
    var pts = room.points, a = pts[i], b = pts[(i + 1) % pts.length];
    var d = sub(b, a), L = len(d), u = norm(d);
    var ccw = signedArea(pts) > 0;
    var n = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    return { index: i, a: a, b: b, u: u, n: n, length: L };
  }

  function walls(room) {
    var out = [];
    for (var i = 0; i < room.points.length; i++) out.push(wall(room, i));
    return out;
  }

  // Köşe dışbükey mi (iç açı < 180°).
  function isConvexVertex(room, i) {
    var pts = room.points, n = pts.length;
    var prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    var c = cross(sub(cur, prev), sub(next, cur));
    return signedArea(pts) > 0 ? c > 0 : c < 0;
  }

  // Duvar boyunu değiştir: duvarın bitiş ucu ve o yönde ötesinde kalan bütün köşeler
  // birlikte kaydırılır. Dikdörtgende karşı duvar da uzar, açılar bozulmaz; L odada
  // "germe" gibi davranır. Başlangıç ucu hiç kıpırdamaz.
  function stretchWall(room, i, newLength) {
    var w = wall(room, i);
    if (!(newLength > 0)) return room;
    var delta = newLength - w.length;
    var pivot = dot(w.b, w.u);
    var start = dot(w.a, w.u);
    var pts = room.points.map(function (p, k) {
      if (k === i) return { x: p.x, y: p.y };
      var s = dot(p, w.u);
      if (s >= pivot - EPS && s > start + EPS) return { x: round1(p.x + w.u.x * delta), y: round1(p.y + w.u.y * delta) };
      return { x: p.x, y: p.y };
    });
    return Object.assign({}, room, { points: pts });
  }

  // Açıklık (kapı/pencere) geçerli mi. offset: duvar başından açıklık merkezine uzaklık.
  function openingProblems(room, op) {
    var problems = [];
    var pts = room.points;
    if (!(op.wall >= 0 && op.wall < pts.length)) return ["duvar yok"];
    var w = wall(room, op.wall);
    if (op.offset - op.width / 2 < -EPS) problems.push("duvarın başından taşıyor");
    if (op.offset + op.width / 2 > w.length + EPS) problems.push("duvarın sonundan taşıyor");
    var top = (op.sill || 0) + op.height;
    if (top > room.height + EPS) problems.push("tavandan yüksek");
    (room.openings || []).forEach(function (o) {
      if (o.id === op.id || o.wall !== op.wall) return;
      if (Math.abs(o.offset - op.offset) < (o.width + op.width) / 2 - EPS) problems.push("başka bir açıklıkla çakışıyor");
    });
    return problems;
  }

  function clampOpening(room, op) {
    var w = wall(room, op.wall);
    var half = op.width / 2;
    var off = Math.max(half, Math.min(w.length - half, op.offset));
    return Object.assign({}, op, { offset: round1(off) });
  }

  // İki odanın çakışan duvar parçaları. Odalar ölçülen iç ölçülerle çizilir; bitişik iki
  // oda aynı çizgiyi paylaşır. O parçada her iki oda duvar kalınlığının yarısını çizer,
  // böylece duvar komşu odanın içine taşmaz ve toplam yine bir duvar kalınlığı olur.
  function sharedSpans(project, roomIdx, wallIdx) {
    var room = project.rooms[roomIdx], w = wall(room, wallIdx);
    var spans = [];
    project.rooms.forEach(function (other, r) {
      if (r === roomIdx) return;
      walls(other).forEach(function (ow) {
        if (Math.abs(cross(w.u, ow.u)) > 1e-3) return;          // paralel değil
        if (Math.abs(cross(w.u, sub(ow.a, w.a))) > EPS) return;  // aynı doğru üstünde değil
        var s1 = dot(sub(ow.a, w.a), w.u), s2 = dot(sub(ow.b, w.a), w.u);
        var lo = Math.max(0, Math.min(s1, s2)), hi = Math.min(w.length, Math.max(s1, s2));
        if (hi - lo > EPS) spans.push({ s0: lo, s1: hi, roomIndex: r, wallIndex: ow.index });
      });
    });
    return spans.sort(function (a, b) { return a.s0 - b.s0; });
  }

  // Bu duvara düşen bütün açıklıklar, kendi koordinatında (s = duvar başından merkez).
  // Komşu odanın ortak duvardaki kapısı da buraya düşer: bir kapı iki odayı birden deler.
  function openingsOnWall(project, roomIdx, wallIdx) {
    var room = project.rooms[roomIdx], w = wall(room, wallIdx);
    var out = [];
    (room.openings || []).forEach(function (o) {
      if (o.wall === wallIdx) out.push({ id: o.id, type: o.type, s: o.offset, width: o.width, height: o.height, sill: o.sill || 0, own: true });
    });
    sharedSpans(project, roomIdx, wallIdx).forEach(function (sp) {
      var other = project.rooms[sp.roomIndex], ow = wall(other, sp.wallIndex);
      (other.openings || []).forEach(function (o) {
        if (o.wall !== sp.wallIndex) return;
        var c = add(ow.a, mul(ow.u, o.offset));
        var s = dot(sub(c, w.a), w.u);
        if (s < sp.s0 - EPS || s > sp.s1 + EPS) return;
        if (out.some(function (e) { return Math.abs(e.s - s) < EPS && Math.abs(e.width - o.width) < EPS; })) return;
        out.push({ id: o.id, type: o.type, s: s, width: o.width, height: o.height, sill: o.sill || 0, own: false });
      });
    });
    return out.sort(function (a, b) { return a.s - b.s; });
  }

  // Duvarı katı parçalara böler: açıklıkların çevresi, altı (pencere denizliği) ve üstü
  // (lento). Her parça {s0, s1, z0, z1, depth}: s duvar boyunca, z yükseklik, depth dışarı
  // doğru kalınlık. Dışbükey köşelerde duvar kalınlığı kadar uzatılır ki köşe boş kalmasın;
  // içbükey köşede uzatılmaz, uzasa odanın içine girerdi.
  function wallPieces(project, roomIdx, wallIdx, thickness) {
    var room = project.rooms[roomIdx], w = wall(room, wallIdx), H = room.height;
    var t = thickness;
    var shared = sharedSpans(project, roomIdx, wallIdx);
    var ops = openingsOnWall(project, roomIdx, wallIdx);

    // Kalınlık aralıkları: ortak kısımlarda t/2, geri kalanında t.
    var cuts = [0, w.length];
    shared.forEach(function (sp) { cuts.push(sp.s0, sp.s1); });
    ops.forEach(function (o) { cuts.push(o.s - o.width / 2, o.s + o.width / 2); });
    cuts = cuts.map(function (c) { return Math.max(0, Math.min(w.length, c)); })
      .sort(function (a, b) { return a - b; })
      .filter(function (c, k, arr) { return k === 0 || c - arr[k - 1] > 1e-6; });

    var extStart = isConvexVertex(room, wallIdx) ? t : 0;
    var extEnd = isConvexVertex(room, (wallIdx + 1) % room.points.length) ? t : 0;

    var pieces = [];
    for (var k = 0; k < cuts.length - 1; k++) {
      var s0 = cuts[k], s1 = cuts[k + 1], mid = (s0 + s1) / 2;
      var isShared = shared.some(function (sp) { return mid > sp.s0 && mid < sp.s1; });
      var depth = isShared ? t / 2 : t;
      var op = null;
      ops.forEach(function (o) { if (mid > o.s - o.width / 2 && mid < o.s + o.width / 2) op = o; });
      var ps0 = s0, ps1 = s1;
      if (k === 0 && !isShared) ps0 -= extStart;
      if (k === cuts.length - 2 && !isShared) ps1 += extEnd;
      if (!op) {
        pieces.push({ s0: ps0, s1: ps1, z0: 0, z1: H, depth: depth });
      } else {
        if (op.sill > 0) pieces.push({ s0: s0, s1: s1, z0: 0, z1: op.sill, depth: depth, kind: "denizlik" });
        var top = op.sill + op.height;
        if (top < H) pieces.push({ s0: s0, s1: s1, z0: top, z1: H, depth: depth, kind: "lento" });
      }
    }
    return pieces;
  }

  // ------------------------------------------------------------------ mobilya

  function dims(item, catalog) {
    var c = catalogItem(catalog, item.type) || {};
    return {
      w: item.w != null ? item.w : c.w,
      d: item.d != null ? item.d : c.d,
      h: item.h != null ? item.h : c.h
    };
  }

  function catalogItem(catalog, type) {
    for (var i = 0; i < (catalog || []).length; i++) if (catalog[i].id === type) return catalog[i];
    return null;
  }

  // Dönük dikdörtgenin dört köşesi. rot derece, planda saat yönünde (y aşağı).
  // Yerel eksen: w yerel x boyunca, d yerel y boyunca; ön yüz yerel +y, arka -y.
  function footprint(cx, cy, w, d, rotDeg) {
    var r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) {
      var lx = k[0] * w / 2, ly = k[1] * d / 2;
      return { x: cx + c * lx - s * ly, y: cy + s * lx + c * ly };
    });
  }

  function itemFootprint(item, catalog) {
    var d = dims(item, catalog);
    return footprint(item.x, item.y, d.w, d.d, item.rot || 0);
  }

  // Ayırıcı eksen teoremi: iki dışbükey çokgen kesişiyor mu. Değmek kesişmek sayılmaz.
  function convexOverlap(A, B) {
    var polys = [A, B];
    for (var p = 0; p < 2; p++) {
      var P = polys[p];
      for (var i = 0; i < P.length; i++) {
        var e = sub(P[(i + 1) % P.length], P[i]);
        var ax = norm({ x: -e.y, y: e.x });
        var a = project1(A, ax), b = project1(B, ax);
        if (a.max <= b.min + EPS || b.max <= a.min + EPS) return false;
      }
    }
    return true;
  }

  function project1(P, ax) {
    var mn = Infinity, mx = -Infinity;
    P.forEach(function (p) { var v = dot(p, ax); if (v < mn) mn = v; if (v > mx) mx = v; });
    return { min: mn, max: mx };
  }

  function roomIndexAt(project, p) {
    for (var i = 0; i < project.rooms.length; i++) if (pointInPolygon(p, project.rooms[i].points)) return i;
    return -1;
  }

  // Kapının açılma alanı: odanın içinde, kapı genişliği kadar derin bir dikdörtgen.
  // Buraya konan mobilya kapıyı kapatır. Ortak duvardaki kapı iki tarafta da alan açar.
  function doorZones(project) {
    var zones = [];
    project.rooms.forEach(function (room, r) {
      walls(room).forEach(function (w) {
        openingsOnWall(project, r, w.index).forEach(function (o) {
          if (o.type !== "door") return;
          var c = add(w.a, mul(w.u, o.s)), hw = o.width / 2;
          var p0 = add(c, mul(w.u, -hw)), p1 = add(c, mul(w.u, hw));
          zones.push({
            roomIndex: r, openingId: o.id,
            poly: [p0, p1, add(p1, mul(w.n, o.width)), add(p0, mul(w.n, o.width))]
          });
        });
      });
    });
    return zones;
  }

  // Yerleşim sorunları. Halı gibi düz (flat) parçalar hiçbir şeyle çakışmaz, kapının
  // önüne de serilebilir; ama odadan taşamaz.
  function layoutIssues(project, variant, catalog) {
    var issues = [];
    var items = variant.furniture || [];
    var fps = items.map(function (it) { return itemFootprint(it, catalog); });
    var zones = doorZones(project);
    items.forEach(function (it, i) {
      var c = catalogItem(catalog, it.type) || {};
      var inRoom = project.rooms.some(function (room) { return polygonInside(fps[i], room.points); });
      if (!inRoom) issues.push({ itemId: it.id, kind: "outside", text: "odanın dışına taşıyor" });
      if (c.flat) return;
      for (var j = i + 1; j < items.length; j++) {
        var cj = catalogItem(catalog, items[j].type) || {};
        if (cj.flat) continue;
        if (convexOverlap(fps[i], fps[j])) {
          issues.push({ itemId: it.id, otherId: items[j].id, kind: "overlap", text: "başka bir mobilyayla çakışıyor" });
          issues.push({ itemId: items[j].id, otherId: it.id, kind: "overlap", text: "başka bir mobilyayla çakışıyor" });
        }
      }
      zones.forEach(function (z) {
        if (convexOverlap(fps[i], z.poly)) issues.push({ itemId: it.id, kind: "door", text: "kapının açılma alanında" });
      });
    });
    return issues;
  }

  function placementOk(project, variant, catalog, cand, ignoreId) {
    var probe = { furniture: (variant.furniture || []).filter(function (f) { return f.id !== ignoreId; }).concat([cand]) };
    return !layoutIssues(project, probe, catalog).some(function (is) { return is.itemId === cand.id; });
  }

  // Yeni parçayı odada boş bir yere koy. Önce arkası duvara dayalı konumlar denenir
  // (uzun duvardan kısaya, 10 cm adımla); olmazsa odanın içinde ızgara. Yer yoksa null —
  // sessizce üst üste koymaz.
  //
  // Katalogdaki iki ipucu sırayı değiştirir:
  //   place: "center"  → halı, orta sehpa, yemek masası: önce odanın ortası
  //   pairsWith: [...] → sandalye, tabure: önce eşi olan masanın çevresi, yüzü masaya
  function autoPlace(project, variant, catalog, roomIdx, item) {
    var room = project.rooms[roomIdx];
    if (!room) return null;
    var c = catalogItem(catalog, item.type) || {};
    var d = dims(item, catalog), step = 10;
    var ws = walls(room).slice().sort(function (a, b) { return b.length - a.length; });
    var tries = [];
    if (c.pairsWith) tries = tries.concat(aroundPartners(room, variant, catalog, c.pairsWith, d));
    if (c.place === "center") tries = tries.concat(centerSpiral(room, ws[0], d, step));
    for (var t = 0; t < tries.length; t++) {
      var cand0 = Object.assign({}, item, { x: round1(tries[t].x), y: round1(tries[t].y), rot: normAngle(tries[t].rot) });
      if (placementOk(project, variant, catalog, cand0)) return cand0;
    }
    for (var k = 0; k < ws.length; k++) {
      var w = ws[k];
      if (w.length < d.w) continue;
      var rot = wallAngle(w);
      var span = w.length - d.w, mid = w.length / 2;
      // Ortadan dışa doğru: ortalı yerleşim önce gelsin.
      var offsets = [];
      for (var s = 0; s <= span / 2 + 1e-6; s += step) { offsets.push(mid + s); if (s) offsets.push(mid - s); }
      for (var q = 0; q < offsets.length; q++) {
        var along = offsets[q];
        var c = add(add(w.a, mul(w.u, along)), mul(w.n, d.d / 2 + 1));
        var cand = Object.assign({}, item, { x: round1(c.x), y: round1(c.y), rot: normAngle(rot) });
        if (placementOk(project, variant, catalog, cand)) return cand;
      }
    }
    var b = bbox(room.points);
    for (var y = b.minY + d.d / 2 + step; y <= b.maxY - d.d / 2; y += step) {
      for (var x = b.minX + d.w / 2 + step; x <= b.maxX - d.w / 2; x += step) {
        var cand2 = Object.assign({}, item, { x: round1(x), y: round1(y), rot: 0 });
        if (placementOk(project, variant, catalog, cand2)) return cand2;
      }
    }
    return null;
  }

  function wallAngle(w) { return Math.round(Math.atan2(-w.n.x, w.n.y) * 180 / Math.PI); }

  // Odanın ortasından dışa doğru sarmal; uzun kenar en uzun duvara paralel.
  function centerSpiral(room, longest, d, step) {
    var c = centroid(room.points), rot = wallAngle(longest), out = [];
    var b = bbox(room.points), R = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
    out.push({ x: c.x, y: c.y, rot: rot });
    for (var r = step; r <= R; r += step) {
      var n = Math.max(8, Math.round(2 * Math.PI * r / step));
      for (var k = 0; k < n; k++) {
        var a = 2 * Math.PI * k / n;
        out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, rot: rot });
      }
    }
    return out;
  }

  // Eş parçanın (masa) çevresinde, yüzü ona dönük konumlar. Uzun kenarlar önce,
  // sonra kısa kenarlar; yuvarlak masada çember üstünde.
  function aroundPartners(room, variant, catalog, partnerTypes, d) {
    var out = [], gap = 2;
    (variant.furniture || []).forEach(function (p) {
      if (partnerTypes.indexOf(p.type) < 0 || !pointInPolygon(p, room.points)) return;
      var pd = dims(p, catalog), pc = catalogItem(catalog, p.type) || {};
      var th = (p.rot || 0) * Math.PI / 180, co = Math.cos(th), si = Math.sin(th);
      function at(lx, ly, faceRot) { out.push({ x: p.x + co * lx - si * ly, y: p.y + si * lx + co * ly, rot: (p.rot || 0) + faceRot }); }
      if (pc.shape === "round-table") {
        var rr = pd.w / 2 + d.d / 2 + gap, n = Math.max(3, Math.floor(2 * Math.PI * rr / (d.w + 15)));
        for (var k = 0; k < n; k++) {
          var a = 2 * Math.PI * k / n, lx = Math.sin(a) * rr, ly = -Math.cos(a) * rr;
          out.push({ x: p.x + lx, y: p.y + ly, rot: a * 180 / Math.PI });
        }
        return;
      }
      // Ön kenar (yerel +y): sandalyenin önü masaya, yani -y'ye bakar → 180°.
      var per = Math.max(1, Math.floor(pd.w / (d.w + 15)));
      var sides = pc.shape === "desk" ? [1] : [1, -1];
      sides.forEach(function (side) {
        for (var i = 0; i < per; i++) {
          var lx = -pd.w / 2 + pd.w * (i + 0.5) / per;
          at(lx, side * (pd.d / 2 + d.d / 2 + gap), side > 0 ? 180 : 0);
        }
      });
      if (pc.shape !== "desk" && pd.d >= d.w + 10) {
        at(pd.w / 2 + d.d / 2 + gap, 0, 90);
        at(-(pd.w / 2 + d.d / 2 + gap), 0, 270);
      }
    });
    return out;
  }

  function normAngle(a) { a = a % 360; if (a < 0) a += 360; return Math.round(a * 1000) / 1000; }

  // Stilin bu oda türü için önerdiği set. ids her parça için bir kimlik verir.
  // Sığmayanlar atlanır ve listelenir — yerleştirilmiş gibi gösterilmez.
  function applyStyleSet(project, variant, catalog, style, roomIdx, ids) {
    var room = project.rooms[roomIdx];
    var set = (style.sets && style.sets[room.kind]) || [];
    var v = Object.assign({}, variant, { furniture: (variant.furniture || []).slice() });
    var placed = [], skipped = [];
    set.forEach(function (type, k) {
      if (!catalogItem(catalog, type)) { skipped.push(type); return; }
      var item = { id: ids[k], type: type, x: 0, y: 0, rot: 0 };
      var p = autoPlace(project, v, catalog, roomIdx, item);
      if (p) { v.furniture.push(p); placed.push(type); } else skipped.push(type);
    });
    return { variant: v, placed: placed, skipped: skipped };
  }

  // ------------------------------------------------------------------ stil ve renk

  // Renk sıcaklığı (K) → sRGB. Tanner Helland'ın yaklaşımı (docs/sources.md);
  // 1000–40000 K için yeterli, görsel ton içindir, ölçüm değil.
  function kelvinToRgb(K) {
    var t = Math.max(1000, Math.min(40000, K)) / 100, r, g, b;
    if (t <= 66) r = 255; else r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661;
    else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    function c(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    return { r: c(r), g: c(g), b: c(b) };
  }

  function hexToRgb(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(c) {
    return "#" + [c.r, c.g, c.b].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
  }

  // Bir mobilya parçasının hangi rengi alacağı: elle verilmiş renk her zaman kazanır,
  // yoksa katalogdaki malzeme yuvası stilin paletinden okunur.
  function itemColor(item, catalog, style, slot) {
    if (item.colors && item.colors[slot]) return item.colors[slot];
    var pal = (style && style.palette) || {};
    return pal[slot] || "#999999";
  }

  var STYLE_REQUIRED = ["id", "name", "floor", "walls", "palette", "light", "sets"];
  var PALETTE_SLOTS = ["wood", "fabric", "metal", "accent", "accent2"];
  var FLOOR_TYPES = ["wood", "herringbone", "tile", "concrete", "terrazzo", "carpet", "stone"];

  function styleProblems(style, catalog) {
    var out = [];
    STYLE_REQUIRED.forEach(function (k) { if (style[k] == null) out.push(style.id + ": " + k + " eksik"); });
    if (style.palette) PALETTE_SLOTS.forEach(function (k) {
      if (!/^#[0-9a-fA-F]{6}$/.test(style.palette[k] || "")) out.push(style.id + ": palette." + k + " geçersiz");
    });
    if (style.floor && FLOOR_TYPES.indexOf(style.floor.type) < 0) out.push(style.id + ": zemin türü bilinmiyor: " + style.floor.type);
    if (style.light && !(style.light.kelvin >= 1500 && style.light.kelvin <= 10000)) out.push(style.id + ": ışık sıcaklığı aralık dışı");
    if (style.sets && catalog) Object.keys(style.sets).forEach(function (kind) {
      style.sets[kind].forEach(function (t) { if (!catalogItem(catalog, t)) out.push(style.id + ": sets." + kind + " bilinmeyen parça " + t); });
    });
    return out;
  }

  // ------------------------------------------------------------------ proje

  var ROOM_KINDS = {
    salon: "Salon", yatak: "Yatak odası", mutfak: "Mutfak", yemek: "Yemek odası",
    calisma: "Çalışma odası", banyo: "Banyo", cocuk: "Çocuk odası", antre: "Antre / koridor"
  };

  function emptyProject(ids) {
    return {
      version: 1,
      name: "Evim",
      wallThickness: 12,
      rooms: [],
      variants: [{ id: ids.variant, name: "Varyant 1", styleId: "japandi", furniture: [] }],
      activeVariantId: ids.variant
    };
  }

  function activeVariant(project) {
    for (var i = 0; i < project.variants.length; i++) if (project.variants[i].id === project.activeVariantId) return project.variants[i];
    return project.variants[0];
  }

  // Yeni oda mevcut odaların sağına, bitişik konur (ortak duvar oluşur).
  function newRectRoom(project, id, name, kind, w, d, height) {
    var x = 0, y = 0;
    if (project.rooms.length) {
      var all = [];
      project.rooms.forEach(function (r) { all = all.concat(r.points); });
      var b = bbox(all);
      x = b.maxX; y = b.minY;
    }
    return { id: id, name: name, kind: kind, height: height || 260, points: rectPoints(x, y, w, d), openings: [] };
  }

  // Kaydetmeden önce: bozuk veriyi reddet. Hata dönerse kayıt yapılmaz.
  function validateProject(p, catalog) {
    var errors = [];
    if (!p || p.version !== 1) errors.push("sürüm bilinmiyor");
    if (!p || !Array.isArray(p.rooms)) return errors.concat(["oda listesi yok"]);
    var ids = {};
    function uniq(id, what) { if (!id) errors.push(what + ": kimlik yok"); else if (ids[id]) errors.push(what + ": kimlik tekrar ediyor " + id); ids[id] = 1; }
    p.rooms.forEach(function (r) {
      uniq(r.id, "oda");
      if (!Array.isArray(r.points) || r.points.length < 3) { errors.push(r.name + ": en az 3 köşe gerekli"); return; }
      if (area(r.points) < 1) errors.push(r.name + ": alanı sıfır");
      if (selfIntersects(r.points)) errors.push(r.name + ": duvarları birbirini kesiyor");
      if (!(r.height > 0)) errors.push(r.name + ": tavan yüksekliği geçersiz");
      (r.openings || []).forEach(function (o) {
        uniq(o.id, "açıklık");
        openingProblems(r, o).forEach(function (pr) { errors.push(r.name + " " + (o.type === "door" ? "kapı" : "pencere") + ": " + pr); });
      });
    });
    for (var i = 0; i < p.rooms.length; i++) {
      for (var j = i + 1; j < p.rooms.length; j++) {
        if (roomsOverlap(p.rooms[i].points, p.rooms[j].points)) errors.push(p.rooms[i].name + " ile " + p.rooms[j].name + " üst üste binmiş");
      }
    }
    if (!Array.isArray(p.variants) || !p.variants.length) errors.push("varyant yok");
    else p.variants.forEach(function (v) {
      uniq(v.id, "varyant");
      (v.furniture || []).forEach(function (f) {
        uniq(f.id, "mobilya");
        if (catalog && !catalogItem(catalog, f.type)) errors.push("bilinmeyen mobilya türü: " + f.type);
      });
    });
    return errors;
  }

  // İki oda alanı üst üste biniyor mu (kenar paylaşmak binmek değildir).
  function roomsOverlap(A, B) {
    for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) {
      if (segmentsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
    function strictlyInside(p, P) { return pointInPolygon(p, P) && distToPolygonEdge(p, P) > EPS; }
    var ca = centroid(A), cb = centroid(B);
    if (strictlyInside(ca, B) && strictlyInside(ca, A)) return true;
    if (strictlyInside(cb, A) && strictlyInside(cb, B)) return true;
    for (i = 0; i < A.length; i++) if (strictlyInside(A[i], B)) return true;
    for (j = 0; j < B.length; j++) if (strictlyInside(B[j], A)) return true;
    return false;
  }

  function summary(project) {
    var rooms = project.rooms.map(function (r) {
      return { id: r.id, name: r.name, areaM2: Math.round(areaM2(r.points) * 100) / 100, perimeter: Math.round(perimeter(r.points)) };
    });
    var total = rooms.reduce(function (s, r) { return s + r.areaM2; }, 0);
    return { rooms: rooms, totalM2: Math.round(total * 100) / 100 };
  }

  // Varyantı çoğalt: mobilyalar yeni kimliklerle kopyalanır.
  function duplicateVariant(variant, newId, name, idFor) {
    return {
      id: newId, name: name, styleId: variant.styleId,
      furniture: (variant.furniture || []).map(function (f, k) { return Object.assign({}, f, { id: idFor(k) }); })
    };
  }

  // Oda silinince içindeki mobilyalar da gider — aksi halde her varyantta "odanın dışında"
  // uyarısı olarak kalırlar.
  function removeRoom(project, roomId, catalog) {
    var idx = project.rooms.findIndex(function (r) { return r.id === roomId; });
    if (idx < 0) return project;
    var room = project.rooms[idx];
    var rooms = project.rooms.filter(function (r) { return r.id !== roomId; });
    var variants = project.variants.map(function (v) {
      return Object.assign({}, v, {
        furniture: (v.furniture || []).filter(function (f) { return !pointInPolygon({ x: f.x, y: f.y }, room.points); })
      });
    });
    return Object.assign({}, project, { rooms: rooms, variants: variants });
  }

  // ------------------------------------------------------------------ referans katmanları
  //
  // LiDAR taraması, 3B model ya da videodan üretilmiş splat: evin kendisi değil, üzerine
  // plan çizilecek bir referans. Dosyanın yerel koordinatı metre ve y yukarı kabul edilir
  // (USDZ, glTF ve RoomPlan böyle). t = {x, y, rot, scale, elev, flip}: plan cm, derece, çarpan,
  // cm; flip, y-aşağı kaydedilmiş dosyaları (COLMAP/3DGS .ply çoğu zaman öyle) x ekseni
  // çevresinde 180° çevirir: (x, y, z) → (x, -y, -z).

  var MESH_EXT = ["usdz", "glb", "gltf", "obj", "ply"];
  var SPLAT_EXT = ["spz", "splat", "ksplat"];

  function fileExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  // .ply hem nokta/örgü hem Gaussian splat olabilir; başlıkta splat'e özgü alanlar aranır.
  function layerKind(name, plyHeader) {
    var ext = fileExt(name);
    if (SPLAT_EXT.indexOf(ext) >= 0) return "splat";
    if (ext === "ply") return /property\s+\w+\s+f_dc_0/.test(plyHeader || "") ? "splat" : "mesh";
    if (MESH_EXT.indexOf(ext) >= 0) return "mesh";
    return null;
  }

  function defaultLayerTransform() { return { x: 0, y: 0, rot: 0, scale: 1, elev: 0, flip: false }; }

  // Modelin yerel (x, z) noktası (metre) → plan (cm).
  function layerToPlan(t, p) {
    var r = t.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), k = t.scale * 100;
    var z = t.flip ? -p.z : p.z;
    return { x: t.x + (c * p.x - s * z) * k, y: t.y + (s * p.x + c * z) * k };
  }

  // Yerel sınır kutusu {minX, maxX, minZ, maxZ} → plandaki sınır kutusu.
  function layerPlanBox(t, box) {
    return bbox([
      layerToPlan(t, { x: box.minX, z: box.minZ }), layerToPlan(t, { x: box.maxX, z: box.minZ }),
      layerToPlan(t, { x: box.maxX, z: box.maxZ }), layerToPlan(t, { x: box.minX, z: box.maxZ })
    ]);
  }

  // Katmanı, yerel kutusunun ortası plandaki hedef noktaya gelecek şekilde kaydır.
  function centerLayerOn(t, box, target) {
    var c = layerToPlan(Object.assign({}, t, { x: 0, y: 0 }), { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 });
    return Object.assign({}, t, { x: round1(target.x - c.x), y: round1(target.y - c.y) });
  }

  function layerTransformProblems(t) {
    var out = [];
    ["x", "y", "rot", "scale", "elev"].forEach(function (k) { if (typeof t[k] !== "number" || !isFinite(t[k])) out.push(k + " sayı değil"); });
    if (!(t.scale > 0)) out.push("ölçek sıfırdan büyük olmalı");
    return out;
  }

  // ------------------------------------------------------------------ fotoğraf derinliği
  //
  // Depth Anything V2 göreli derinlik verir (yakın = parlak), metre değil. Bu yalnız
  // fotoğrafı kabartma olarak göstermek içindir; buradan ölçü çıkarılmaz.
  // data: w×h tek kanallı 0–255 dizi. Çıktı gw×gh ızgara, 0 (uzak) – 1 (yakın).
  function reliefGrid(data, w, h, gw, gh) {
    var out = new Float32Array(gw * gh), mn = 255, mx = 0, i;
    for (i = 0; i < data.length; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
    var span = mx - mn || 1;
    for (var gy = 0; gy < gh; gy++) {
      for (var gx = 0; gx < gw; gx++) {
        var sx = Math.min(w - 1, Math.round(gx / Math.max(1, gw - 1) * (w - 1)));
        var sy = Math.min(h - 1, Math.round(gy / Math.max(1, gh - 1) * (h - 1)));
        out[gy * gw + gx] = (data[sy * w + sx] - mn) / span;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ fotoğraftan oda
  //
  // Metreyle ölçmeden, tek bir fotoğraftan tahmini oda. Ölçek, boyutu bilinen bir
  // dikdörtgenden gelir: kapı. Kapının dört köşesi ve kameranın odak uzaklığı (EXIF)
  // kameranın kapıya göre konumunu ve eğimini verir (düzlemsel homografi → poz). Kapının
  // alt kenarı zemindedir, yani zemin düzlemi de bilinir; zemin köşelerine dokunulan
  // noktalardan çıkan ışınlar zeminle kesiştirilerek metrik konumları bulunur.
  //
  // Kapı çerçevesi: X duvar boyunca sağa, Y yukarı, Z duvardan odaya (kameraya) doğru;
  // başlangıç kapının sol alt köşesi. Kameranın yalnız kapı YÜKSEKLİĞİNE ihtiyacı var:
  // dikdörtgenin en/boy oranı, odak uzaklığı bilinince görüntüden çıkar.

  // 35 mm karşılığı odak uzaklığı → piksel. 35 mm film köşegeni 43.27 mm.
  function focalPx(f35, w, h) { return f35 * Math.hypot(w, h) / Math.hypot(36, 24); }

  function solveLinear(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var k = M[r][c] / M[c][c];
        for (var j = c; j <= n; j++) M[r][j] -= k * M[c][j];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  // Dört nokta eşlemesinden homografi (h33 = 1). src → dst.
  function homography4(src, dst) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solveLinear(A, b);
    return h ? h.concat([1]) : null;
  }

  function applyH(H, p) {
    var w = H[6] * p.x + H[7] * p.y + H[8];
    return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
  }

  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function d3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function c3(a, b) { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  function s3(a, k) { return v3(a.x * k, a.y * k, a.z * k); }
  function a3(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function n3(a) { var l = Math.sqrt(d3(a, a)); return l ? s3(a, 1 / l) : a; }

  // Dokunulan dört köşeyi sırala: alttaki iki (y büyük) sol-sağ, üstteki iki sol-sağ.
  function sortRectCorners(pts) {
    var s = pts.slice().sort(function (a, b) { return a.y - b.y; });
    var top = s.slice(0, 2).sort(function (a, b) { return a.x - b.x; });
    var bot = s.slice(2).sort(function (a, b) { return a.x - b.x; });
    return { bl: bot[0], br: bot[1], tr: top[1], tl: top[0] };
  }

  // Kapıdan kamera pozu. cam = {f, cx, cy}; doorHeight cm.
  // Dönen: R (kapı→kamera, sütunlar r1 r2 r3), t, C (kameranın kapı çerçevesindeki yeri, cm),
  // doorWidth (görüntüden çıkan, cm).
  function poseFromDoor(corners, cam, doorHeight) {
    var k = sortRectCorners(corners);
    var H = homography4([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], [k.bl, k.br, k.tr, k.tl]);
    if (!H) return { error: "kapı köşeleri bir dikdörtgen oluşturmuyor" };
    function kinv(a, b, c) { return v3((a - cam.cx * c) / cam.f, (b - cam.cy * c) / cam.f, c); }
    var col1 = kinv(H[0], H[3], H[6]), col2 = kinv(H[1], H[4], H[7]), col3 = kinv(H[2], H[5], H[8]);
    // Görüntüde y aşağı; kapı çerçevesinde Y yukarı. v ekseni zaten yukarı eşlendi (bl→tl),
    // yani col2 görüntüde yukarı giden yönü taşır; kamera ekseninde bu -y'dir, doğal.
    if (col3.z < 0) { col1 = s3(col1, -1); col2 = s3(col2, -1); col3 = s3(col3, -1); }
    var l1 = Math.sqrt(d3(col1, col1)), l2 = Math.sqrt(d3(col2, col2));
    var lambda = l2 / doorHeight;
    var r1 = n3(col1), r2 = n3(col2);
    // Gram–Schmidt'i iki eksene eşit dağıt: gürültüde birini kayırmaz.
    var bis = n3(a3(r1, r2)), perp = n3(c3(c3(r1, r2), bis));
    // perp, bis'ten r2 tarafına bakar: r1 = (bis − perp)/√2, r2 = (bis + perp)/√2.
    r1 = n3(a3(s3(bis, Math.SQRT1_2), s3(perp, -Math.SQRT1_2)));
    r2 = n3(a3(s3(bis, Math.SQRT1_2), s3(perp, Math.SQRT1_2)));
    var r3 = c3(r1, r2);
    var t = s3(col3, 1 / lambda);
    // C = -Rᵀ t
    var C = v3(-(r1.x * t.x + r1.y * t.y + r1.z * t.z), -(r2.x * t.x + r2.y * t.y + r2.z * t.z), -(r3.x * t.x + r3.y * t.y + r3.z * t.z));
    if (C.z <= 0) return { error: "kamera kapının arkasında çıktı; köşeler yanlış yerde olabilir" };
    return { R: [r1, r2, r3], t: t, C: C, doorWidth: l1 / lambda, doorHeight: doorHeight };
  }

  // Görüntüdeki bir noktanın zemin (Y = 0) üzerindeki yeri, kapı çerçevesinde (cm).
  function floorPointFromPixel(pose, cam, p) {
    var dc = v3((p.x - cam.cx) / cam.f, (p.y - cam.cy) / cam.f, 1);
    var R = pose.R;
    var d = v3(d3(R[0], dc), d3(R[1], dc), d3(R[2], dc)); // Rᵀ dc
    if (d.y >= -1e-9) return null; // ufuk çizgisinin üstü: zemine değmez
    var lam = -pose.C.y / d.y;
    return { x: pose.C.x + lam * d.x, z: pose.C.z + lam * d.z };
  }

  // Kapı çerçevesindeki bir noktayı görüntüye izdüşür (test ve önizleme için).
  function projectPoint(pose, cam, P) {
    var R = pose.R, t = pose.t;
    var X = v3(R[0].x * P.x + R[1].x * P.y + R[2].x * P.z + t.x,
               R[0].y * P.x + R[1].y * P.y + R[2].y * P.z + t.y,
               R[0].z * P.x + R[1].z * P.y + R[2].z * P.z + t.z);
    return { x: cam.f * X.x / X.z + cam.cx, y: cam.f * X.y / X.z + cam.cy, z: X.z };
  }

  // Fotoğraftan dikdörtgen oda. Kapının bulunduğu duvar odanın bir duvarıdır (Z = 0) ve
  // oda eksenleri o duvara paraleldir. Diğer duvarlar dokunulan zemin köşelerinden;
  // "köşede durarak çektim" denirse kameranın zemindeki izdüşümü de bir köşe sayılır.
  // input = {door:[4 px], floor:[px…], image:{w,h}, f35, doorHeight, cameraInCorner}
  function roomFromPhoto(input) {
    var cam = { f: focalPx(input.f35, input.image.w, input.image.h), cx: input.image.w / 2, cy: input.image.h / 2 };
    if (!input.door || input.door.length !== 4) return { error: "kapının dört köşesi gerekli" };
    var pose = poseFromDoor(input.door, cam, input.doorHeight);
    if (pose.error) return { error: pose.error };
    var warnings = [];
    var pts = [{ x: 0, z: 0 }, { x: pose.doorWidth, z: 0 }];
    var floor = [];
    for (var i = 0; i < (input.floor || []).length; i++) {
      var q = floorPointFromPixel(pose, cam, input.floor[i]);
      if (!q) return { error: (i + 1) + ". zemin köşesi ufuk çizgisinin üstünde; zemine değen noktaya dokunun" };
      if (q.z < -15) warnings.push((i + 1) + ". köşe kapının duvarının arkasında çıktı");
      floor.push(q);
      pts.push({ x: q.x, z: Math.max(0, q.z) });
    }
    if (input.cameraInCorner) pts.push({ x: pose.C.x, z: pose.C.z });
    var xs = pts.map(function (p) { return p.x; }), zs = pts.map(function (p) { return p.z; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs), zmax = Math.max.apply(null, zs);
    var width = xmax - xmin, depth = zmax;
    if (depth < 60) warnings.push("odanın derinliği bu fotoğraftan çıkmıyor; karşı duvarın köşelerine dokunun ya da köşede durarak çekin");
    if (pose.C.y < 60 || pose.C.y > 220) warnings.push("kamera yüksekliği " + Math.round(pose.C.y) + " cm çıktı; kapı köşeleri ya da kapı yüksekliği yanlış olabilir");
    return {
      width: width, depth: depth,
      doorOffset: -xmin + pose.doorWidth / 2, doorWidth: pose.doorWidth, doorHeight: pose.doorHeight,
      cameraHeight: pose.C.y, camera: { x: pose.C.x - xmin, z: pose.C.z }, floor: floor, warnings: warnings, focalPx: cam.f
    };
  }

  // Dokunuşların ±px kaymasına karşı en/derinlik aralığı. rand: 0–1 üreten fonksiyon (test
  // için tohumlu verilir).
  function photoRoomSpread(input, rand, n, px) {
    var W = [], D = [];
    function jit(p) { return { x: p.x + (rand() * 2 - 1) * px, y: p.y + (rand() * 2 - 1) * px }; }
    for (var i = 0; i < n; i++) {
      var r = roomFromPhoto(Object.assign({}, input, { door: input.door.map(jit), floor: (input.floor || []).map(jit) }));
      if (!r.error) { W.push(r.width); D.push(r.depth); }
    }
    if (!W.length) return null;
    return { width: [Math.min.apply(null, W), Math.max.apply(null, W)], depth: [Math.min.apply(null, D), Math.max.apply(null, D)], samples: W.length };
  }

  function seededRandom(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  root.EvEngine = {
    EPS: EPS,
    ROOM_KINDS: ROOM_KINDS,
    FLOOR_TYPES: FLOOR_TYPES,
    PALETTE_SLOTS: PALETTE_SLOTS,

    snap: snap,
    signedArea: signedArea,
    area: area,
    areaM2: areaM2,
    perimeter: perimeter,
    centroid: centroid,
    bbox: bbox,
    pointInPolygon: pointInPolygon,
    distToSegment: distToSegment,
    selfIntersects: selfIntersects,
    polygonInside: polygonInside,
    roomsOverlap: roomsOverlap,

    rectPoints: rectPoints,
    wall: wall,
    walls: walls,
    isConvexVertex: isConvexVertex,
    stretchWall: stretchWall,
    openingProblems: openingProblems,
    clampOpening: clampOpening,
    sharedSpans: sharedSpans,
    openingsOnWall: openingsOnWall,
    wallPieces: wallPieces,

    catalogItem: catalogItem,
    dims: dims,
    footprint: footprint,
    itemFootprint: itemFootprint,
    convexOverlap: convexOverlap,
    roomIndexAt: roomIndexAt,
    doorZones: doorZones,
    layoutIssues: layoutIssues,
    autoPlace: autoPlace,
    applyStyleSet: applyStyleSet,
    normAngle: normAngle,

    kelvinToRgb: kelvinToRgb,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    itemColor: itemColor,
    styleProblems: styleProblems,

    emptyProject: emptyProject,
    activeVariant: activeVariant,
    newRectRoom: newRectRoom,
    validateProject: validateProject,
    summary: summary,
    duplicateVariant: duplicateVariant,
    removeRoom: removeRoom,

    fileExt: fileExt,
    layerKind: layerKind,
    defaultLayerTransform: defaultLayerTransform,
    layerToPlan: layerToPlan,
    layerPlanBox: layerPlanBox,
    centerLayerOn: centerLayerOn,
    layerTransformProblems: layerTransformProblems,
    reliefGrid: reliefGrid,

    focalPx: focalPx,
    homography4: homography4,
    applyH: applyH,
    sortRectCorners: sortRectCorners,
    poseFromDoor: poseFromDoor,
    floorPointFromPixel: floorPointFromPixel,
    projectPoint: projectPoint,
    roomFromPhoto: roomFromPhoto,
    photoRoomSpread: photoRoomSpread,
    seededRandom: seededRandom
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
