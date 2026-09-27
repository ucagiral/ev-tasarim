// 2B plan editörü (SVG). Koordinatlar cm; görünüm {x, y, scale} ile kaydırılır ve
// yakınlaştırılır. Plan her değişiklikte baştan çizilir — durum uygulamada, burada değil.
//
// Etkileşimler:
//   boş alanı sürükle → kaydır · tekerlek → yakınlaştır
//   mobilyayı sürükle → taşı (5 cm ızgara, duvara yapışır; Alt: serbest)
//   seçili odanın köşesini sürükle → şekli değiştir; kenar ortasındaki + → yeni köşe
//   duvar ölçüsüne tıkla → boyu yaz
//   kapı/pencereyi sürükle → duvar boyunca kaydır
//   çizim kipi: tıkla-tıkla, ilk noktaya tıkla ya da Enter → oda

const E = globalThis.EvEngine;
const NS = "http://www.w3.org/2000/svg";
const GRID = 5;

const CATEGORY_FILL = {
  oturma: "#cdb9a3", yatak: "#b9c6cf", masa: "#d6c7a8", depolama: "#c3b6a6",
  mutfak: "#c9cfc4", banyo: "#c4d4da", dekor: "#d9cfc0"
};

export class Plan2D {
  constructor(container, api) {
    this.api = api;
    this.container = container;
    this.view = { x: -100, y: -100, scale: 1 };
    this.drawing = null; // {points:[], hover}
    this.drag = null;
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("class", "plan-svg");
    this.svg.setAttribute("tabindex", "0");
    container.appendChild(this.svg);
    this.input = document.createElement("input");
    this.input.className = "plan-length-input";
    this.input.type = "number";
    this.input.hidden = true;
    container.appendChild(this.input);

    this.svg.addEventListener("pointerdown", (e) => this._down(e));
    this.svg.addEventListener("pointermove", (e) => this._move(e));
    this.svg.addEventListener("pointerup", (e) => this._up(e));
    this.svg.addEventListener("dblclick", (e) => this._dbl(e));
    this.svg.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    new ResizeObserver(() => (this.userMoved ? this.render() : this.fit())).observe(container);
    this._raf = 0;
  }

  // ---------------------------------------------------------------- koordinat
  toPlan(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.view.scale + this.view.x, y: (e.clientY - r.top) / this.view.scale + this.view.y };
  }
  toScreen(p) {
    return { x: (p.x - this.view.x) * this.view.scale, y: (p.y - this.view.y) * this.view.scale };
  }

  fit() {
    const { project } = this.api.get();
    const pts = [];
    project.rooms.forEach((r) => pts.push(...r.points));
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    if (!pts.length) { this.view = { x: -100, y: -100, scale: Math.min(w, h) / 800 }; this.render(); return; }
    const b = E.bbox(pts), pad = 90;
    const bw = b.maxX - b.minX + pad * 2, bh = b.maxY - b.minY + pad * 2;
    const scale = Math.min(w / bw, h / bh);
    this.view = { scale, x: b.minX - pad - (w / scale - bw) / 2, y: b.minY - pad - (h / scale - bh) / 2 };
    this.render();
  }

  startDrawing() { this.drawing = { points: [], hover: null }; this.render(); this.svg.focus(); }
  cancelDrawing() { this.drawing = null; this.render(); }

  finishDrawing() {
    const d = this.drawing;
    this.drawing = null;
    if (d && d.points.length >= 3) this.api.createRoomFromPoints(d.points);
    this.render();
  }

  // ---------------------------------------------------------------- çizim
  render() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _render() {
    const { project, variant, catalog, selection, issues } = this.api.get();
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const s = this.view.scale, T = project.wallThickness || 12;
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", h);
    const px = (n) => n / s; // ekran pikseli → cm

    const parts = [];
    parts.push(`<defs>
      <pattern id="g-minor" width="${10}" height="${10}" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" class="grid-minor" stroke-width="${px(0.5)}"/></pattern>
      <pattern id="g-major" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#g-minor)"/><path d="M100 0H0V100" fill="none" class="grid-major" stroke-width="${px(1)}"/></pattern>
    </defs>`);
    parts.push(`<g transform="scale(${s}) translate(${-this.view.x} ${-this.view.y})">`);
    parts.push(`<rect x="${this.view.x}" y="${this.view.y}" width="${w / s}" height="${h / s}" fill="url(#g-major)" data-kind="bg"/>`);

    const selRoomId = selection && selection.kind === "room" ? selection.id : null;
    const selOpening = selection && selection.kind === "opening" ? selection : null;

    // Oda zeminleri
    project.rooms.forEach((room) => {
      const pts = room.points.map((p) => `${p.x},${p.y}`).join(" ");
      parts.push(`<polygon points="${pts}" class="room-floor${room.id === selRoomId ? " selected" : ""}" data-kind="room" data-id="${room.id}"/>`);
    });

    // Tarama altlıkları (LiDAR / model): üstten kesit görüntüsü, oda zemininin üstünde, duvar ve mobilyanın altında — üzerine çizilebilsin diye.
    (this.api.get().layers || []).forEach((L) => {
      if (!L.planVisible || !L.image) return;
      const t = L.transform, b = L.box, k = t.scale * 100;
      const y0 = t.flip ? -b.maxZ : b.minZ;
      parts.push(`<g transform="translate(${t.x} ${t.y}) rotate(${t.rot}) scale(${k})" class="underlay"><image href="${L.image}" x="${b.minX}" y="${y0}" width="${b.maxX - b.minX}" height="${b.maxZ - b.minZ}" preserveAspectRatio="none"/></g>`);
    });

    // Kapı açılma alanları ve mobilya (duvarların altında kalsın)
    const bad = new Map();
    (issues || []).forEach((i) => { if (!bad.has(i.itemId)) bad.set(i.itemId, i.text); });
    const items = (variant.furniture || []).slice().sort((a, b) => {
      const fa = (E.catalogItem(catalog, a.type) || {}).flat ? 0 : 1, fb = (E.catalogItem(catalog, b.type) || {}).flat ? 0 : 1;
      return fa - fb;
    });
    items.forEach((it) => {
      const c = E.catalogItem(catalog, it.type);
      if (!c) return;
      const d = E.dims(it, catalog);
      const sel = selection && selection.kind === "item" && selection.id === it.id;
      const cls = ["item", c.flat ? "flat" : "", sel ? "selected" : "", bad.has(it.id) ? "bad" : ""].join(" ");
      const fill = c.flat ? "none" : (CATEGORY_FILL[c.category] || "#ccc");
      const fs = Math.max(8, Math.min(16, d.w / 7));
      parts.push(`<g transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})" data-kind="item" data-id="${it.id}" class="${cls}">
        <rect x="${-d.w / 2}" y="${-d.d / 2}" width="${d.w}" height="${d.d}" rx="${Math.min(4, d.w / 10)}" fill="${fill}" stroke-width="${px(sel ? 2 : 1)}"/>
        ${c.flat ? "" : `<line x1="${-d.w / 2 + 2}" y1="${d.d / 2 - 2}" x2="${d.w / 2 - 2}" y2="${d.d / 2 - 2}" class="front" stroke-width="${px(2)}"/>`}
        <text y="${fs / 3}" font-size="${fs}" class="item-label">${esc(shortName(c.name))}</text>
      </g>`);
      if (sel) {
        // Tutamak parçanın arka yönünde durur; sürükleme açısı onun yönünden okunur.
        const r = (it.rot || 0) * Math.PI / 180, reach = d.d / 2 + px(24);
        const handle = { x: it.x + Math.sin(r) * reach, y: it.y - Math.cos(r) * reach };
        parts.push(`<line x1="${it.x}" y1="${it.y}" x2="${handle.x}" y2="${handle.y}" class="rot-line" stroke-width="${px(1)}"/>`);
        parts.push(`<circle cx="${handle.x}" cy="${handle.y}" r="${px(7)}" class="rot-handle" data-kind="rotate" data-id="${it.id}" stroke-width="${px(1.5)}"/>`);
      }
    });

    // Duvarlar (duvar parçalarının zemine değen kısmı) ve açıklık sembolleri
    project.rooms.forEach((room, ri) => {
      E.walls(room).forEach((wl) => {
        E.wallPieces(project, ri, wl.index, T).forEach((pc) => {
          if (pc.z0 > 0 || pc.kind === "denizlik") return;
          const q = quad(wl, pc.s0, pc.s1, pc.depth);
          parts.push(`<polygon points="${q}" class="wall" data-kind="room" data-id="${room.id}"/>`);
        });
        E.openingsOnWall(project, ri, wl.index).forEach((o) => {
          if (!o.own) return;
          const sel = selOpening && selOpening.id === o.id;
          const a = add(wl.a, mul(wl.u, o.s - o.width / 2)), b = add(wl.a, mul(wl.u, o.s + o.width / 2));
          if (o.type === "window") {
            const q = quad(wl, o.s - o.width / 2, o.s + o.width / 2, T);
            parts.push(`<polygon points="${q}" class="window${sel ? " selected" : ""}" data-kind="opening" data-room="${room.id}" data-id="${o.id}" stroke-width="${px(1)}"/>`);
            const m1 = add(a, mul(wl.n, -T / 2)), m2 = add(b, mul(wl.n, -T / 2));
            parts.push(`<line x1="${m1.x}" y1="${m1.y}" x2="${m2.x}" y2="${m2.y}" class="window-line" stroke-width="${px(1)}"/>`);
          } else {
            const tip = add(a, mul(wl.n, o.width));
            const sweep = E.signedArea(room.points) > 0 ? 1 : 0;
            parts.push(`<g class="door${sel ? " selected" : ""}" data-kind="opening" data-room="${room.id}" data-id="${o.id}">
              <polygon points="${quad(wl, o.s - o.width / 2, o.s + o.width / 2, T)}" class="door-gap"/>
              <line x1="${a.x}" y1="${a.y}" x2="${tip.x}" y2="${tip.y}" stroke-width="${px(1.5)}"/>
              <path d="M${tip.x} ${tip.y} A${o.width} ${o.width} 0 0 ${sweep} ${b.x} ${b.y}" fill="none" stroke-width="${px(1)}" stroke-dasharray="${px(4)} ${px(3)}"/>
            </g>`);
          }
        });
      });
    });

    // Oda etiketleri ve duvar ölçüleri
    project.rooms.forEach((room, ri) => {
      const c = E.centroid(room.points);
      const fs = px(13);
      parts.push(`<text x="${c.x}" y="${c.y - fs * 0.2}" font-size="${fs}" class="room-label">${esc(room.name)}</text>`);
      parts.push(`<text x="${c.x}" y="${c.y + fs * 1.1}" font-size="${fs * 0.85}" class="room-area">${E.areaM2(room.points).toFixed(1)} m²</text>`);
      if (room.id === selRoomId || !selRoomId) {
        E.walls(room).forEach((wl) => {
          // İki odanın tam paylaştığı duvarın ölçüsü bir kez yazılır.
          if (room.id !== selRoomId) {
            const sh = E.sharedSpans(project, ri, wl.index);
            const covered = sh.reduce((a, sp) => a + sp.s1 - sp.s0, 0);
            if (covered >= wl.length - 1 && sh.some((sp) => sp.roomIndex < ri)) return;
          }
          const mid = add(mul(add(wl.a, wl.b), 0.5), mul(wl.n, -(T + px(14))));
          const txt = `${Math.round(wl.length)}`;
          parts.push(`<text x="${mid.x}" y="${mid.y + px(4)}" font-size="${px(11)}" class="wall-len${room.id === selRoomId ? " editable" : ""}" data-kind="wall-len" data-room="${room.id}" data-wall="${wl.index}">${txt}</text>`);
        });
      }
    });

    // Seçili odanın köşe tutamakları
    if (selRoomId) {
      const room = project.rooms.find((r) => r.id === selRoomId);
      if (room) {
        room.points.forEach((p, i) => {
          const n = room.points[(i + 1) % room.points.length];
          const m = mul(add(p, n), 0.5);
          parts.push(`<circle cx="${m.x}" cy="${m.y}" r="${px(5)}" class="mid-handle" data-kind="mid" data-room="${room.id}" data-index="${i}" stroke-width="${px(1)}"/>`);
        });
        room.points.forEach((p, i) => {
          parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${px(7)}" class="vertex" data-kind="vertex" data-room="${room.id}" data-index="${i}" stroke-width="${px(2)}"/>`);
        });
      }
    }

    // Çizim önizlemesi
    if (this.drawing) {
      const pts = this.drawing.points.slice();
      if (this.drawing.hover) pts.push(this.drawing.hover);
      if (pts.length) {
        parts.push(`<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" class="draw-line" stroke-width="${px(2)}"/>`);
        pts.forEach((p, i) => parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${px(i === 0 ? 8 : 4)}" class="draw-pt${i === 0 ? " first" : ""}" stroke-width="${px(1.5)}"/>`));
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], m = mul(add(a, b), 0.5);
          parts.push(`<text x="${m.x}" y="${m.y - px(6)}" font-size="${px(11)}" class="draw-len">${Math.round(Math.hypot(b.x - a.x, b.y - a.y))}</text>`);
        }
      }
    }

    parts.push(`</g>`);
    // Ölçek çubuğu (1 m)
    parts.push(`<g class="scalebar" transform="translate(16 ${h - 18})"><line x1="0" y1="0" x2="${100 * s}" y2="0"/><line x1="0" y1="-4" x2="0" y2="4"/><line x1="${100 * s}" y1="-4" x2="${100 * s}" y2="4"/><text x="${50 * s}" y="-6">1 m</text></g>`);
    this.svg.innerHTML = parts.join("");
    this.svg.classList.toggle("drawing", !!this.drawing);
  }

  // ---------------------------------------------------------------- etkileşim
  _target(e) {
    let el = e.target;
    while (el && el !== this.svg) {
      if (el.dataset && el.dataset.kind) return el;
      el = el.parentNode;
    }
    return null;
  }

  _down(e) {
    if (e.button === 1 || e.button === 2) { this._startPan(e); return; }
    this.svg.focus();
    this.input.hidden = true;
    const p = this.toPlan(e);
    if (this.drawing) {
      const q = this._snapDraw(p, e.altKey);
      const pts = this.drawing.points;
      if (pts.length >= 3 && Math.hypot(q.x - pts[0].x, q.y - pts[0].y) < 12 / this.view.scale + 1) { this.finishDrawing(); return; }
      pts.push(q);
      this.render();
      return;
    }
    const t = this._target(e);
    const kind = t ? t.dataset.kind : "bg";
    const st = this.api.get();

    if (kind === "item") {
      const it = st.variant.furniture.find((f) => f.id === t.dataset.id);
      this.api.select({ kind: "item", id: it.id });
      this.api.begin();
      this.drag = { type: "item", id: it.id, start: p, orig: { x: it.x, y: it.y }, moved: false };
    } else if (kind === "rotate") {
      this.api.begin();
      this.drag = { type: "rotate", id: t.dataset.id, moved: false };
    } else if (kind === "vertex") {
      this.api.begin();
      this.drag = { type: "vertex", roomId: t.dataset.room, index: +t.dataset.index, moved: false };
    } else if (kind === "mid") {
      const room = st.project.rooms.find((r) => r.id === t.dataset.room);
      const i = +t.dataset.index;
      const a = room.points[i], b = room.points[(i + 1) % room.points.length];
      const pts = room.points.slice();
      pts.splice(i + 1, 0, { x: E.snap((a.x + b.x) / 2, 1), y: E.snap((a.y + b.y) / 2, 1) });
      this.api.begin();
      // Yeni köşe eklenince sonraki duvarların indisi kayar; açıklıkları da kaydır.
      const openings = (room.openings || []).map((o) => (o.wall > i ? { ...o, wall: o.wall + 1 } : o));
      this.api.apply(replaceRoom(st.project, { ...room, points: pts, openings }));
      this.drag = { type: "vertex", roomId: room.id, index: i + 1, moved: true };
    } else if (kind === "opening") {
      this.api.select({ kind: "opening", roomId: t.dataset.room, id: t.dataset.id });
      this.api.begin();
      this.drag = { type: "opening", roomId: t.dataset.room, id: t.dataset.id, moved: false };
    } else if (kind === "wall-len") {
      const room = st.project.rooms.find((r) => r.id === t.dataset.room);
      if (st.selection && st.selection.kind === "room" && st.selection.id === room.id) { this._editLength(room, +t.dataset.wall, e); return; }
      this.api.select({ kind: "room", id: room.id });
    } else if (kind === "room") {
      this.api.select({ kind: "room", id: t.dataset.id });
      this._startPan(e, true);
    } else {
      this._startPan(e, true, true);
    }
    this.svg.setPointerCapture(e.pointerId);
  }

  _startPan(e, clickSelects, clearOnClick) {
    this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false, clearOnClick };
    this.svg.setPointerCapture(e.pointerId);
  }

  _move(e) {
    const p = this.toPlan(e);
    if (this.drawing) { this.drawing.hover = this._snapDraw(p, e.altKey); this.render(); return; }
    const d = this.drag;
    if (!d) return;
    const st = this.api.get();
    if (d.type === "pan") {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) this.userMoved = true;
      this.view.x = d.vx - dx / this.view.scale;
      this.view.y = d.vy - dy / this.view.scale;
      this.render();
      return;
    }
    d.moved = true;
    if (d.type === "item") {
      const it = st.variant.furniture.find((f) => f.id === d.id);
      let x = d.orig.x + (p.x - d.start.x), y = d.orig.y + (p.y - d.start.y);
      if (!e.altKey) { x = E.snap(x, GRID); y = E.snap(y, GRID); }
      let moved = { ...it, x, y };
      if (!e.altKey) moved = snapToWall(st.project, moved, st.catalog);
      this.api.apply(st.project, replaceItem(st.variant, moved));
    } else if (d.type === "rotate") {
      const it = st.variant.furniture.find((f) => f.id === d.id);
      let ang = Math.atan2(p.x - it.x, -(p.y - it.y)) * 180 / Math.PI;
      ang = e.altKey ? Math.round(ang) : Math.round(ang / 15) * 15;
      this.api.apply(st.project, replaceItem(st.variant, { ...it, rot: E.normAngle(ang) }));
    } else if (d.type === "vertex") {
      const room = st.project.rooms.find((r) => r.id === d.roomId);
      const q = e.altKey ? { x: Math.round(p.x), y: Math.round(p.y) } : this._snapVertex(st.project, room, d.index, p);
      const pts = room.points.slice();
      pts[d.index] = q;
      this.api.apply(replaceRoom(st.project, { ...room, points: pts }));
    } else if (d.type === "opening") {
      const ri = st.project.rooms.findIndex((r) => r.id === d.roomId);
      const room = st.project.rooms[ri];
      const op = room.openings.find((o) => o.id === d.id);
      const wl = E.wall(room, op.wall);
      const s = E.snap(E.snap(dot(sub(p, wl.a), wl.u), e.altKey ? 1 : GRID), 1);
      const moved = E.clampOpening(room, { ...op, offset: s });
      this.api.apply(replaceRoom(st.project, { ...room, openings: room.openings.map((o) => (o.id === op.id ? moved : o)) }));
    }
  }

  _up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.type === "pan") {
      if (!d.moved && d.clearOnClick) this.api.select(null);
      return;
    }
    this.api.end();
  }

  _dbl(e) {
    const t = this._target(e);
    if (this.drawing) { this.finishDrawing(); return; }
    if (t && t.dataset.kind === "vertex") {
      const st = this.api.get();
      const room = st.project.rooms.find((r) => r.id === t.dataset.room);
      if (room.points.length <= 3) return;
      const i = +t.dataset.index;
      const pts = room.points.filter((_, k) => k !== i);
      // Silinen köşeyle birleşen iki duvardaki açıklıklar düşer; sonrakilerin indisi kayar.
      const n = room.points.length;
      const prev = (i - 1 + n) % n;
      const openings = (room.openings || [])
        .filter((o) => o.wall !== i && o.wall !== prev)
        .map((o) => ({ ...o, wall: o.wall > i ? o.wall - 1 : o.wall }));
      this.api.commit(replaceRoom(st.project, { ...room, points: pts, openings }));
    }
  }

  _wheel(e) {
    e.preventDefault();
    const p = this.toPlan(e);
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.max(0.15, Math.min(8, this.view.scale * k));
    this.userMoved = true;
    const r = this.svg.getBoundingClientRect();
    this.view.scale = s;
    this.view.x = p.x - (e.clientX - r.left) / s;
    this.view.y = p.y - (e.clientY - r.top) / s;
    this.render();
  }

  _snapDraw(p, free) {
    if (free) return { x: Math.round(p.x), y: Math.round(p.y) };
    let q = { x: E.snap(p.x, GRID), y: E.snap(p.y, GRID) };
    const pts = this.drawing.points;
    const tol = 10 / this.view.scale + 4;
    // Önceki noktaya dik açı
    if (pts.length) {
      const last = pts[pts.length - 1];
      if (Math.abs(q.x - last.x) < tol) q.x = last.x;
      if (Math.abs(q.y - last.y) < tol) q.y = last.y;
    }
    if (pts.length >= 2) {
      const first = pts[0];
      if (Math.abs(q.x - first.x) < tol) q.x = first.x;
      if (Math.abs(q.y - first.y) < tol) q.y = first.y;
    }
    // Mevcut odaların köşelerine yapış
    const { project } = this.api.get();
    project.rooms.forEach((r) => r.points.forEach((v) => {
      if (Math.hypot(v.x - p.x, v.y - p.y) < tol) q = { x: v.x, y: v.y };
    }));
    return q;
  }

  _snapVertex(project, room, index, p) {
    const q = { x: E.snap(p.x, GRID), y: E.snap(p.y, GRID) };
    const tol = 10 / this.view.scale + 4;
    const n = room.points.length;
    const neighbors = [room.points[(index - 1 + n) % n], room.points[(index + 1) % n]];
    neighbors.forEach((v) => {
      if (Math.abs(q.x - v.x) < tol) q.x = v.x;
      if (Math.abs(q.y - v.y) < tol) q.y = v.y;
    });
    project.rooms.forEach((r) => {
      if (r.id === room.id) return;
      r.points.forEach((v) => { if (Math.hypot(v.x - p.x, v.y - p.y) < tol) { q.x = v.x; q.y = v.y; } });
    });
    return q;
  }

  _editLength(room, wallIndex, e) {
    const wl = E.wall(room, wallIndex);
    const r = this.container.getBoundingClientRect();
    const inp = this.input;
    inp.hidden = false;
    inp.value = Math.round(wl.length);
    inp.style.left = `${e.clientX - r.left - 40}px`;
    inp.style.top = `${e.clientY - r.top - 16}px`;
    inp.focus();
    inp.select();
    const done = (ok) => {
      inp.onkeydown = inp.onblur = null;
      inp.hidden = true;
      if (!ok) return;
      const v = parseFloat(inp.value);
      if (!(v > 10)) return;
      const st = this.api.get();
      const cur = st.project.rooms.find((x) => x.id === room.id);
      this.api.commit(replaceRoom(st.project, E.stretchWall(cur, wallIndex, v)));
    };
    inp.onkeydown = (ev) => { if (ev.key === "Enter") done(true); else if (ev.key === "Escape") done(false); };
    inp.onblur = () => done(true);
  }
}

// ---------------------------------------------------------------- yardımcılar
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function mul(a, k) { return { x: a.x * k, y: a.y * k }; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }

function quad(wl, s0, s1, depth) {
  const a = add(wl.a, mul(wl.u, s0)), b = add(wl.a, mul(wl.u, s1));
  const o = mul(wl.n, -depth);
  return [a, b, add(b, o), add(a, o)].map((p) => `${p.x},${p.y}`).join(" ");
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function shortName(n) { return n.replace(/\s*\(.*\)$/, ""); }

export function replaceRoom(project, room) {
  return { ...project, rooms: project.rooms.map((r) => (r.id === room.id ? room : r)) };
}

export function replaceItem(variant, item) {
  return { ...variant, furniture: variant.furniture.map((f) => (f.id === item.id ? item : f)) };
}

// Mobilya bir duvara 12 cm'den yakınsa duvara dayanır.
function snapToWall(project, item, catalog) {
  const ri = E.roomIndexAt(project, item);
  if (ri < 0) return item;
  const fp = E.itemFootprint(item, catalog);
  let best = null;
  E.walls(project.rooms[ri]).forEach((wl) => {
    let minD = Infinity;
    fp.forEach((p) => {
      const along = dot(sub(p, wl.a), wl.u);
      if (along < -1 || along > wl.length + 1) return;
      minD = Math.min(minD, dot(sub(p, wl.a), wl.n));
    });
    if (minD !== Infinity && Math.abs(minD) < 12 && (!best || Math.abs(minD) < Math.abs(best.d))) best = { d: minD, n: wl.n };
  });
  if (!best) return item;
  return { ...item, x: Math.round((item.x - best.n.x * best.d) * 10) / 10, y: Math.round((item.y - best.n.y * best.d) * 10) / 10 };
}
