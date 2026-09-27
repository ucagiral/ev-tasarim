// Uygulama kabuğu: durum, geçmiş (geri al/yinele), kayıt ve paneller. Kural yok —
// kurallar engine.js'de. Plan ve 3B görünüm durumu buradan okur.

import { Plan2D, replaceRoom, replaceItem } from "./plan2d.js";
import { View3D } from "./view3d.js";
import * as store from "./store.js";
import * as layers from "./layers.js";

const E = globalThis.EvEngine;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = (p) => p + "-" + (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const clone = (o) => JSON.parse(JSON.stringify(o));

const S = {
  project: null,
  catalog: [],
  categories: {},
  styles: new Map(),
  styleOrder: [],
  selection: null,
  undo: [],
  redo: [],
  pending: null,
  tab: "rooms",
  photoRoomId: null,
  photos: [],
  layers: [],
  layout: "split"
};

// ---------------------------------------------------------------- durum erişimi
function variant() { return E.activeVariant(S.project); }
function style() { return S.styles.get(variant().styleId) || S.styles.get(S.styleOrder[0]); }

let issuesCache = { key: null, value: [] };
function issues() {
  const v = variant();
  if (issuesCache.key !== S.project) issuesCache = { key: S.project, value: E.layoutIssues(S.project, v, S.catalog) };
  return issuesCache.value;
}

const api = {
  get: () => ({ project: S.project, variant: variant(), catalog: S.catalog, style: style(), selection: S.selection, issues: issues(), layers: planLayers() }),
  begin() { if (!S.pending) S.pending = JSON.stringify(S.project); },
  apply(project, v) {
    if (v) project = { ...project, variants: project.variants.map((x) => (x.id === v.id ? v : x)) };
    S.project = project;
    renderLive();
  },
  end() {
    const before = S.pending;
    S.pending = null;
    if (!before || before === JSON.stringify(S.project)) return;
    // Bir değişiklik yeni bir geometri hatası getiriyorsa geri alınır: kaydedilen proje
    // her zaman geçerlidir.
    const prevErrors = new Set(E.validateProject(JSON.parse(before), S.catalog));
    const fresh = E.validateProject(S.project, S.catalog).filter((e) => !prevErrors.has(e));
    if (fresh.length) {
      S.project = JSON.parse(before);
      toast("Yapılamadı: " + fresh[0], true);
      renderAll();
      return;
    }
    S.undo.push(before);
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    save();
    renderAll();
  },
  commit(project, v) { api.begin(); api.apply(project, v); api.end(); },
  select(sel) { S.selection = sel; renderAll(); },
  createRoomFromPoints(points) {
    const n = S.project.rooms.length + 1;
    const room = { id: uid("oda"), name: "Oda " + n, kind: "salon", height: 260, points, openings: [] };
    api.commit({ ...S.project, rooms: [...S.project.rooms, room] });
    if (S.project.rooms.some((r) => r.id === room.id)) { S.selection = { kind: "room", id: room.id }; S.tab = "rooms"; renderAll(); }
  }
};

function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.project));
  S.project = JSON.parse(S.undo.pop());
  fixSelection(); save(); renderAll();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.project));
  S.project = JSON.parse(S.redo.pop());
  fixSelection(); save(); renderAll();
}
function fixSelection() {
  const s = S.selection;
  if (!s) return;
  if (s.kind === "item" && !variant().furniture.some((f) => f.id === s.id)) S.selection = null;
  if (s.kind === "room" && !S.project.rooms.some((r) => r.id === s.id)) S.selection = null;
  if (s.kind === "opening" && !S.project.rooms.some((r) => r.id === s.roomId && r.openings.some((o) => o.id === s.id))) S.selection = null;
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveProject(S.project).catch((e) => toast("Kaydedilemedi: " + e.message, true)), 300);
}

// ---------------------------------------------------------------- çizim
let plan, view;
let liveRaf = 0;
function renderLive() {
  plan.render();
  cancelAnimationFrame(liveRaf);
  liveRaf = requestAnimationFrame(() => update3d());
}
function update3d() {
  const st = api.get();
  view.update({ ...st, focusRoomId: selectedRoomId() });
}
function renderAll() {
  renderLive();
  renderTopbar();
  renderTab();
  renderRight();
}

function selectedRoomId() {
  const s = S.selection;
  if (!s) return null;
  if (s.kind === "room") return s.id;
  if (s.kind === "opening") return s.roomId;
  if (s.kind === "item") {
    const it = variant().furniture.find((f) => f.id === s.id);
    const ri = it ? E.roomIndexAt(S.project, it) : -1;
    return ri >= 0 ? S.project.rooms[ri].id : null;
  }
  return null;
}

function renderTopbar() {
  const name = $("#project-name");
  if (document.activeElement !== name) name.value = S.project.name;
  $("#undo").disabled = !S.undo.length;
  $("#redo").disabled = !S.redo.length;
  document.querySelectorAll("#layout-seg button").forEach((b) => b.classList.toggle("on", b.dataset.layout === S.layout));
  document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === view.mode));
  $("#plan-hint").textContent = plan.drawing ? "Köşelere tıkla · ilk noktaya tıkla ya da Enter ile bitir · Esc iptal · Alt: serbest" : "";
  $("#view-hint").textContent = view.mode === "walk" ? "W A S D yürü · fare bak · Shift koş · Esc çık" : "";
}

// ---------------------------------------------------------------- sol sekmeler
function renderTab() {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
  const body = $("#tab-body");
  const focusId = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
  body.innerHTML = ({ rooms: tabRooms, furniture: tabFurniture, styles: tabStyles, variants: tabVariants, photos: tabPhotos, layers: tabLayers })[S.tab]();
  if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
}

function kindOptions(sel) {
  return Object.entries(E.ROOM_KINDS).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v}</option>`).join("");
}

function tabRooms() {
  const rid = selectedRoomId();
  const rooms = S.project.rooms.map((r) => `
    <button class="list-item${r.id === rid ? " on" : ""}" data-act="select-room" data-id="${r.id}">
      <span>${esc(r.name)} <small>${E.ROOM_KINDS[r.kind] || ""}</small></span><small>${E.areaM2(r.points).toFixed(1)} m²</small>
    </button>`).join("") || `<p class="hint">Henüz oda yok. Aşağıdan dikdörtgen bir oda ekleyin ya da planda çizin.</p>`;

  let editor = "";
  const room = S.project.rooms.find((r) => r.id === rid);
  if (room) {
    const ri = S.project.rooms.indexOf(room);
    const wallRows = E.walls(room).map((w) => {
      const shared = E.sharedSpans(S.project, ri, w.index).length ? " · ortak" : "";
      return `<tr><td>${w.index + 1}</td>
        <td><input type="number" id="wl-${w.index}" data-act="wall-len" data-wall="${w.index}" value="${Math.round(w.length)}" min="20" step="1"> cm<small class="hint">${shared}</small></td>
        <td><button data-act="add-door" data-wall="${w.index}" title="Bu duvara kapı ekle">+ Kapı</button></td>
        <td><button data-act="add-window" data-wall="${w.index}" title="Bu duvara pencere ekle">+ Pencere</button></td></tr>`;
    }).join("");
    const ops = room.openings.map((o) => openingEditor(room, o)).join("") || `<p class="hint">Kapı ya da pencere yok.</p>`;
    editor = `
      <h3>Seçili oda</h3>
      <div class="field"><span>Ad</span><input id="room-name" data-act="room-name" value="${esc(room.name)}"></div>
      <div class="field"><span>Tür</span><select id="room-kind" data-act="room-kind">${kindOptions(room.kind)}</select></div>
      <div class="field"><span>Tavan (cm)</span><input type="number" id="room-height" data-act="room-height" value="${room.height}" min="180" max="600"></div>
      <h3>Duvarlar</h3>
      <p class="hint">Boy değişince duvarın bitiş ucu ve ötesindeki köşeler kayar; başlangıç sabit kalır. Planda köşeleri sürükleyebilir, ölçü yazısına tıklayabilirsiniz.</p>
      <table class="walls">${wallRows}</table>
      <h3>Kapı ve pencereler</h3>
      ${ops}
      <div class="row"><button class="danger" data-act="delete-room">Odayı sil</button></div>`;
  }

  return `
    <h3>Odalar</h3>
    <div class="list">${rooms}</div>
    <h3>Oda ekle</h3>
    <div class="field"><span>Ad</span><input id="new-name" value="Oda ${S.project.rooms.length + 1}"></div>
    <div class="field"><span>Tür</span><select id="new-kind">${kindOptions("salon")}</select></div>
    <div class="row"><label>En</label><input type="number" id="new-w" value="400" min="50"><label>Boy</label><input type="number" id="new-d" value="350" min="50"><label>cm</label></div>
    <div class="row"><button class="primary" data-act="add-rect">Dikdörtgen ekle</button><button data-act="draw">Planda çiz</button></div>
    <p class="hint">Yeni oda mevcut planın sağına, bitişik konur; ortak duvar kendiliğinden oluşur. Ölçüler odanın iç ölçüsüdür.</p>
    ${editor}`;
}

function openingEditor(room, o) {
  const on = S.selection && S.selection.kind === "opening" && S.selection.id === o.id;
  const p = E.openingProblems(room, o);
  return `<div class="opening-edit${on ? " on" : ""}" data-op="${o.id}">
    <div class="row"><b>${o.type === "door" ? "Kapı" : "Pencere"}</b><small class="hint">duvar ${o.wall + 1}</small>
      <span class="spacer"></span><button data-act="select-opening" data-id="${o.id}">Seç</button><button class="danger" data-act="delete-opening" data-id="${o.id}">Sil</button></div>
    <div class="row">
      <label>En</label><input type="number" id="op-w-${o.id}" data-act="op-field" data-field="width" data-id="${o.id}" value="${o.width}">
      <label>Yük.</label><input type="number" id="op-h-${o.id}" data-act="op-field" data-field="height" data-id="${o.id}" value="${o.height}">
      ${o.type === "window" ? `<label>Denizlik</label><input type="number" id="op-s-${o.id}" data-act="op-field" data-field="sill" data-id="${o.id}" value="${o.sill || 0}">` : ""}
    </div>
    ${p.length ? `<p class="hint" style="color:var(--bad)">${esc(p.join(", "))}</p>` : ""}
  </div>`;
}

function tabFurniture() {
  const groups = Object.entries(S.categories).map(([cat, label]) => {
    const items = S.catalog.filter((c) => c.category === cat).map((c) =>
      `<button data-act="add-item" data-type="${c.id}"><span>${esc(c.name)}</span><small>${c.w}×${c.d}×${c.h}</small></button>`).join("");
    return `<h3>${esc(label)}</h3><div class="cat-items">${items}</div>`;
  }).join("");
  const rid = selectedRoomId();
  const room = S.project.rooms.find((r) => r.id === rid) || S.project.rooms[0];
  return `<p class="hint">Tıklayınca ${room ? `<b>${esc(room.name)}</b> odasında` : "seçili odada"} boş bir yere konur (önce duvar dibi). Ölçüler en×derinlik×yükseklik cm; parça seçilince sağdan değiştirilebilir.</p>${groups}`;
}

function tabStyles() {
  const cur = variant().styleId;
  const cards = S.styleOrder.map((id) => {
    const s = S.styles.get(id);
    const sw = [s.walls, s.floor.color, s.palette.wood, s.palette.fabric, s.palette.accent, s.palette.accent2]
      .map((c) => `<span style="background:${c}"></span>`).join("");
    return `<button class="style-card${id === cur ? " on" : ""}" data-act="set-style" data-id="${id}" title="${esc(s.description)}"><div class="swatches">${sw}</div><b>${esc(s.name)}</b></button>`;
  }).join("");
  const s = style();
  const rid = selectedRoomId();
  const room = S.project.rooms.find((r) => r.id === rid);
  const setFor = room ? (s.sets[room.kind] || []) : [];
  const setNames = setFor.map((t) => (E.catalogItem(S.catalog, t) || {}).name || t).join(", ");
  return `
    <p class="hint">Stil bu varyantın malzeme, renk ve ışığını değiştirir; mobilyanın yeri değişmez. Başka bir stili yan yana görmek için Varyant sekmesinden çoğaltın.</p>
    <div class="styles-grid">${cards}</div>
    <h3>${esc(s.name)}</h3>
    <p>${esc(s.description)}</p>
    <p class="hint">Işık ${s.light.kelvin} K · zemin: ${esc(floorName(s.floor.type))}</p>
    <ul class="hint">${(s.materials || []).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
    <h3>Mobilya seti</h3>
    ${room ? `<p class="hint"><b>${esc(room.name)}</b> (${E.ROOM_KINDS[room.kind]}) için: ${esc(setNames) || "bu oda türü için set yok"}</p>` : `<p class="hint">Bir oda seçin.</p>`}
    <div class="row">
      <button class="primary" data-act="apply-set" ${room ? "" : "disabled"}>Seçili odaya ekle</button>
      <button data-act="apply-set-all">Bütün odalara ekle</button>
    </div>
    <div class="row"><button class="danger" data-act="clear-room" ${room ? "" : "disabled"}>Seçili odayı boşalt</button></div>
    <p class="hint">Sığmayan parçalar eklenmez ve adıyla bildirilir.</p>`;
}

function floorName(t) {
  return { wood: "ahşap parke", herringbone: "balıksırtı parke", tile: "karo", concrete: "beton", terrazzo: "terrazzo", carpet: "halıfleks", stone: "taş" }[t] || t;
}

function tabVariants() {
  const list = S.project.variants.map((v) => {
    const on = v.id === S.project.activeVariantId;
    const sname = (S.styles.get(v.styleId) || {}).name || v.styleId;
    return `<div class="list-item variant${on ? " on" : ""}" data-act="activate-variant" data-id="${v.id}">
      ${v.thumb ? `<img src="${v.thumb}" alt="">` : `<div class="noimg"></div>`}
      <div><b>${esc(v.name)}</b><br><small>${esc(sname)} · ${v.furniture.length} parça</small>
        <div class="row"><label><input type="checkbox" data-act="compare-pick" data-id="${v.id}" ${S.comparePick?.includes(v.id) ? "checked" : ""}> karşılaştır</label></div></div>
    </div>`;
  }).join("");
  return `
    <p class="hint">Aynı ev için farklı stil ve yerleşimleri ayrı varyantlarda deneyin. Oda geometrisi bütün varyantlarda ortaktır.</p>
    <div class="list">${list}</div>
    <div class="row">
      <button data-act="dup-variant">Çoğalt</button>
      <button data-act="new-variant">Yeni boş</button>
      <button data-act="rename-variant">Adını değiştir</button>
      <button class="danger" data-act="delete-variant" ${S.project.variants.length > 1 ? "" : "disabled"}>Sil</button>
    </div>
    <div class="row">
      <button data-act="thumb">Küçük resmi güncelle</button>
      <button class="primary" data-act="compare" ${(S.comparePick || []).length === 2 ? "" : "disabled"}>Seçili ikisini karşılaştır</button>
    </div>
    <p class="hint">Karşılaştırma iki varyantı 3B görünümün şu anki açısından çizer.</p>`;
}

function tabPhotos() {
  const rooms = S.project.rooms;
  if (!rooms.length) return `<p class="hint">Önce bir oda ekleyin.</p>`;
  if (!rooms.some((r) => r.id === S.photoRoomId)) S.photoRoomId = selectedRoomId() || rooms[0].id;
  const opts = rooms.map((r) => `<option value="${r.id}"${r.id === S.photoRoomId ? " selected" : ""}>${esc(r.name)}</option>`).join("");
  const photos = S.photos.filter((p) => p.roomId === S.photoRoomId);
  const grid = photos.map((p) => `<div class="photo" data-act="open-photo" data-id="${p.id}"><img src="${p.url}" alt="${esc(p.name)}"><button class="depth-btn" data-act="depth-photo" data-id="${p.id}" title="Derinlikten kabartma (deneysel)">3B</button><button data-act="delete-photo" data-id="${p.id}" title="Sil">×</button></div>`).join("");
  return `
    <div class="field"><span>Oda</span><select id="photo-room" data-act="photo-room">${opts}</select></div>
    <label class="btn" style="display:block;text-align:center;margin:8px 0">Fotoğraf ekle<input type="file" id="photo-input" accept="image/*" multiple hidden></label>
    <div class="photos">${grid || `<p class="hint" style="grid-column:1/-1">Bu odanın fotoğrafı yok.</p>`}</div>
    <p class="hint">Tasarlarken gerçek odayı yan yana görmek için. Fotoğraflar yalnız bu tarayıcıda saklanır, hiçbir yere gönderilmez.</p>
    <p class="hint"><b>3B</b> düğmesi (deneysel): fotoğrafın derinliğini tarayıcıda bir yapay zekâ modeliyle (Depth Anything V2) tahmin edip fotoğrafı döndürülebilir bir kabartmaya çevirir. İlk seferde ~50 MB model indirilir. Sonuç <b>göreli</b> derinliktir, ölçü değildir.</p>`;
}

function tabLayers() {
  const list = S.layers.map((L) => {
    const t = L.transform;
    const num = (f, v, step) => `<input type="number" id="ly-${f}-${L.id}" data-act="layer-t" data-field="${f}" data-id="${L.id}" value="${Math.round(v * 1000) / 1000}" step="${step}">`;
    return `<div class="layer${L.error ? " err" : ""}">
      <div class="row"><b>${esc(L.name)}</b><small class="hint">${L.kind === "splat" ? "splat" : "model"}</small></div>
      ${L.error ? `<p class="hint" style="color:var(--bad)">${esc(L.error)}</p>` : `
      <div class="row">
        <label><input type="checkbox" data-act="layer-vis" data-id="${L.id}" ${L.visible ? "checked" : ""}> 3B'de</label>
        ${L.kind === "mesh" ? `<label><input type="checkbox" data-act="layer-plan" data-id="${L.id}" ${L.planVisible ? "checked" : ""}> planda altlık</label>` : ""}
        <label><input type="checkbox" data-act="layer-flip" data-id="${L.id}" ${t.flip ? "checked" : ""}> ters çevir</label>
      </div>
      <div class="grid">
        <span>X cm</span>${num("x", t.x, 5)}<span>Y cm</span>${num("y", t.y, 5)}
        <span>Açı °</span>${num("rot", t.rot, 1)}<span>Ölçek</span>${num("scale", t.scale, 0.01)}
        <span>Yükseklik</span>${num("elev", t.elev, 1)}<span></span><span></span>
      </div>
      ${L.box ? `<p class="hint">Boyut: ${((L.box.maxX - L.box.minX) * t.scale).toFixed(2)} × ${((L.box.maxZ - L.box.minZ) * t.scale).toFixed(2)} × ${((L.box.maxY - L.box.minY) * t.scale).toFixed(2)} m</p>` : ""}`}
      <div class="row">${L.error ? "" : `<button data-act="layer-center" data-id="${L.id}">Plana ortala</button>`}<button class="danger" data-act="layer-delete" data-id="${L.id}">Sil</button></div>
    </div>`;
  }).join("");
  return `
    <p class="hint">Evin gerçek taramasını altlık olarak yükleyin, odaları üzerine çizin ya da hizalayın. Dosya yalnız bu tarayıcıda açılır ve saklanır.</p>
    <label class="btn" style="display:block;text-align:center;margin:8px 0">Dosya yükle<input type="file" id="layer-input" accept=".usdz,.glb,.gltf,.obj,.ply,.spz,.splat,.ksplat" hidden></label>
    <div>${list || `<p class="hint">Katman yok.</p>`}</div>
    <h3>Hangi dosya?</h3>
    <ul class="hint">
      <li><b>LiDAR (iPhone/iPad Pro):</b> ücretsiz tarama uygulamalarının (ör. OpenPlan3D Capture, Lagarsoft LiDAR Scanner) <b>USDZ</b> çıktısı. Ölçü metre olarak gelir, ölçek 1 kalmalı.</li>
      <li><b>Video:</b> odayı yavaşça dolaşarak çekin, videoyu bir Gaussian splat eğiticisinde (ör. Brush) işleyin, çıkan <b>.ply / .spz</b> dosyasını yükleyin. Bu dosyaların ölçeği keyfîdir: bilinen bir ölçüye göre "Ölçek"i ayarlayın; yan yatık ya da ters gelirse "ters çevir".</li>
      <li><b>3B model:</b> GLB/glTF (tek dosya), OBJ, .ply örgü.</li>
    </ul>`;
}

function planLayers() {
  return S.layers.filter((L) => L.box && !L.error).map((L) => ({ id: L.id, transform: L.transform, box: L.box, image: L.image, planVisible: !!L.planVisible }));
}

async function hydrateLayer(L) {
  try {
    const built = await layers.buildLayerObject(L);
    L.box = built.box;
    L.outer = layers.wrap(built.object);
    L.splat = built.splat;
    layers.applyTransform(L.outer, L.transform);
    if (!built.splat) L.image = await layers.topDownImage(view.renderer, built.object, built.box, !!L.transform.flip);
    L.error = null;
  } catch (e) {
    console.error(e);
    L.error = "Açılamadı: " + (e && e.message ? e.message : e);
  }
}

async function loadLayers() {
  const list = await store.listLayers().catch(() => []);
  S.layers = list.sort((a, b) => String(a.added).localeCompare(String(b.added)));
  for (const L of S.layers) await hydrateLayer(L);
  await syncLayers();
}

async function syncLayers() {
  try {
    await view.setLayers(S.layers.filter((L) => L.outer).map((L) => ({ outer: L.outer, splat: L.splat, visible: L.visible })));
  } catch (e) {
    toast("Splat görüntüleyici yüklenemedi: " + e.message, true);
  }
  plan.render();
  if (S.tab === "layers") renderTab();
}

function persistLayer(L) {
  const { outer, box, image, splat, error, ...rec } = L;
  return store.putLayer(rec);
}

async function addLayerFile(file) {
  const kind = await layers.detectKind(file);
  if (!kind) { toast("Desteklenmeyen dosya: " + file.name, true); return; }
  const L = { id: uid("t"), name: file.name, kind, blob: file, transform: E.defaultLayerTransform(), visible: true, planVisible: kind === "mesh", added: new Date().toISOString() };
  toast("Açılıyor: " + file.name);
  await hydrateLayer(L);
  if (!L.error) {
    // İlk yüklemede evin ortasına getir; ev yoksa başlangıç noktasına.
    const pts = S.project.rooms.flatMap((r) => r.points);
    const b = pts.length ? E.bbox(pts) : null;
    L.transform = E.centerLayerOn(L.transform, L.box, b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 });
    layers.applyTransform(L.outer, L.transform);
  }
  S.layers.push(L);
  await persistLayer(L);
  await syncLayers();
  plan.fit();
  view.hasFramed = false;
  update3d();
  toast(L.error ? L.error : "Katman eklendi: " + file.name, !!L.error);
}

async function setLayerTransform(L, t) {
  const probs = E.layerTransformProblems(t);
  if (probs.length) { toast("Geçersiz: " + probs[0], true); renderTab(); return; }
  const flipChanged = !!t.flip !== !!L.transform.flip;
  L.transform = t;
  if (L.outer) layers.applyTransform(L.outer, t);
  if (flipChanged && L.outer && !L.splat) L.image = await layers.topDownImage(view.renderer, L.outer.userData.inner.children[0], L.box, !!t.flip);
  await persistLayer(L);
  plan.render();
  renderTab();
}

// ---------------------------------------------------------------- fotoğraf derinliği
async function openDepth(photo) {
  modal(`<div class="depth-view" id="depth-view"><div class="status" id="depth-status">Hazırlanıyor…</div></div>
    <p class="hint">Deneysel. Derinlik göreli bir tahmindir (yakın/uzak), ölçü değildir. Fareyle döndürün.</p>`);
  const status = (m) => { const el = document.getElementById("depth-status"); if (el) el.textContent = m; };
  const dlg = $("#modal");
  let dispose = null;
  const onClose = () => { if (dispose) dispose(); dlg.removeEventListener("close", onClose); };
  dlg.addEventListener("close", onClose);
  try {
    const { estimateDepth, reliefViewer } = await import("./depth.js");
    const depth = await estimateDepth(photo.blob, status);
    if (!dlg.open) return;
    document.getElementById("depth-status").remove();
    dispose = reliefViewer(document.getElementById("depth-view"), photo.url, depth);
  } catch (e) {
    console.error(e);
    status("Derinlik çıkarılamadı: " + (e && e.message ? e.message : e) + ". Model dosyaları huggingface.co'dan indirilir; ağ bu adresi engelliyorsa çalışmaz.");
  }
}

// ---------------------------------------------------------------- sağ panel
function renderRight() {
  const el = $("#right");
  const focusId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
  const s = S.selection;
  let sel = "";
  if (s && s.kind === "item") sel = itemPanel(variant().furniture.find((f) => f.id === s.id));
  else if (s && s.kind === "opening") {
    const room = S.project.rooms.find((r) => r.id === s.roomId);
    const o = room && room.openings.find((x) => x.id === s.id);
    if (o) sel = `<h3>${o.type === "door" ? "Kapı" : "Pencere"} · ${esc(room.name)}</h3>${openingEditor(room, o)}<p class="hint">Planda sürükleyerek duvar boyunca kaydırın.</p>`;
  } else if (s && s.kind === "room") {
    const room = S.project.rooms.find((r) => r.id === s.id);
    if (room) sel = `<h3>${esc(room.name)}</h3><table class="summary"><tr><td>Alan</td><td>${E.areaM2(room.points).toFixed(2)} m²</td></tr><tr><td>Çevre</td><td>${(E.perimeter(room.points) / 100).toFixed(2)} m</td></tr><tr><td>Tavan</td><td>${room.height} cm</td></tr><tr><td>Hacim</td><td>${(E.areaM2(room.points) * room.height / 100).toFixed(1)} m³</td></tr></table><p class="hint">Köşeleri sürükleyin; kenar ortasındaki noktayı çekerek köşe ekleyin, köşeye çift tıklayarak silin.</p>`;
  }
  if (!sel) sel = `<h3>Kısayollar</h3><div class="kbd">
    <kbd>Sürükle</kbd><span>boş alanda: kaydır</span><kbd>Tekerlek</kbd><span>yakınlaştır</span>
    <kbd>R</kbd><span>seçili parçayı 90° döndür</span><kbd>Shift+R</kbd><span>15° döndür</span>
    <kbd>Ok tuşları</kbd><span>1 cm kaydır (Shift: 10)</span><kbd>Ctrl+D</kbd><span>çoğalt</span>
    <kbd>Del</kbd><span>sil</span><kbd>Ctrl+Z / Y</kbd><span>geri al / yinele</span><kbd>Alt</kbd><span>ızgarasız taşı</span></div>`;

  const iss = issues();
  const issuesHtml = iss.length
    ? `<ul class="issues">${dedupeIssues(iss).map((i) => `<li data-act="select-item" data-id="${i.itemId}">${esc(itemName(i.itemId))}: ${esc(i.text)}</li>`).join("")}</ul>`
    : `<p class="ok">Yerleşimde sorun yok.</p>`;

  const sum = E.summary(S.project);
  const rows = sum.rooms.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.areaM2.toFixed(1)} m²</td></tr>`).join("");
  el.innerHTML = `${sel}
    <h3>Sorunlar</h3>${issuesHtml}
    <h3>Özet</h3><table class="summary" style="width:100%">${rows}<tr><td><b>Toplam</b></td><td><b>${sum.totalM2.toFixed(1)} m²</b></td></tr>
    <tr><td>Stil</td><td>${esc(style().name)}</td></tr><tr><td>Mobilya</td><td>${variant().furniture.length}</td></tr></table>`;
  if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
}

function dedupeIssues(list) {
  const seen = new Set();
  return list.filter((i) => { const k = i.itemId + i.kind; if (seen.has(k)) return false; seen.add(k); return true; });
}
function itemName(id) {
  const it = variant().furniture.find((f) => f.id === id);
  return it ? (E.catalogItem(S.catalog, it.type) || {}).name || it.type : id;
}

function itemPanel(it) {
  if (!it) return "";
  const c = E.catalogItem(S.catalog, it.type);
  const d = E.dims(it, S.catalog);
  const st = style();
  const slots = { wood: "Ahşap / gövde", fabric: "Kumaş", metal: "Metal", accent: "Vurgu", accent2: "Vurgu 2" };
  const colorRows = Object.entries(slots).map(([k, label]) => {
    const own = it.colors && it.colors[k];
    return `<div class="row"><input type="color" id="col-${k}" data-act="item-color" data-slot="${k}" value="${E.itemColor(it, S.catalog, st, k)}"><label>${label}${own ? " · elle" : ""}</label>${own ? `<button data-act="item-color-reset" data-slot="${k}">stile dön</button>` : ""}</div>`;
  }).join("");
  const custom = it.w != null || it.d != null || it.h != null;
  const own = issues().filter((i) => i.itemId === it.id);
  return `<h3>${esc(c.name)}</h3>
    <div class="row"><label>En</label><input type="number" id="it-w" data-act="item-dim" data-field="w" value="${d.w}" min="1">
      <label>Der.</label><input type="number" id="it-d" data-act="item-dim" data-field="d" value="${d.d}" min="1"></div>
    <div class="row"><label>Yük.</label><input type="number" id="it-h" data-act="item-dim" data-field="h" value="${d.h}" min="1">
      <label>Açı</label><input type="number" id="it-r" data-act="item-rot" value="${Math.round(it.rot || 0)}" step="15"></div>
    ${custom ? `<div class="row"><small class="hint">Katalog ölçüsü: ${c.w}×${c.d}×${c.h}</small><button data-act="item-dim-reset">katalog ölçüsüne dön</button></div>` : ""}
    <div class="row"><button data-act="rotate">↻ 90°</button><button data-act="duplicate">Çoğalt</button><button class="danger" data-act="delete-item">Sil</button></div>
    ${own.length ? `<ul class="issues">${dedupeIssues(own).map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>` : ""}
    <h3>Renkler</h3>${colorRows}
    <p class="hint">Elle verilen renk stil değişince de korunur.</p>`;
}

// ---------------------------------------------------------------- eylemler
function roomById(id) { return S.project.rooms.find((r) => r.id === id); }
function withRoom(room) { return replaceRoom(S.project, room); }

function targetRoomIndex() {
  const rid = selectedRoomId();
  const i = S.project.rooms.findIndex((r) => r.id === rid);
  return i >= 0 ? i : (S.project.rooms.length ? 0 : -1);
}

function addItem(type) {
  const ri = targetRoomIndex();
  if (ri < 0) { toast("Önce bir oda ekleyin.", true); return; }
  const it = E.autoPlace(S.project, variant(), S.catalog, ri, { id: uid("m"), type, x: 0, y: 0, rot: 0 });
  if (!it) { toast(`${E.catalogItem(S.catalog, type).name}: ${S.project.rooms[ri].name} odasında boş yer yok.`, true); return; }
  const v = variant();
  api.commit(S.project, { ...v, furniture: [...v.furniture, it] });
  S.selection = { kind: "item", id: it.id };
  renderAll();
}

function applySet(roomIndexes) {
  const st = style();
  let v = variant();
  const report = [];
  roomIndexes.forEach((ri) => {
    const set = st.sets[S.project.rooms[ri].kind] || [];
    const res = E.applyStyleSet(S.project, v, S.catalog, st, ri, set.map(() => uid("m")));
    v = res.variant;
    if (res.skipped.length) report.push(`${S.project.rooms[ri].name}: ${res.skipped.map((t) => (E.catalogItem(S.catalog, t) || {}).name || t).join(", ")} sığmadı`);
  });
  api.commit(S.project, v);
  toast(report.length ? report.join(" · ") : "Set eklendi.", !!report.length);
}

function clearRoom(ri) {
  const room = S.project.rooms[ri];
  const v = variant();
  api.commit(S.project, { ...v, furniture: v.furniture.filter((f) => !E.pointInPolygon(f, room.points)) });
}

function addOpening(room, wallIdx, type) {
  const w = E.wall(room, wallIdx);
  const o = type === "door"
    ? { id: uid("k"), type: "door", wall: wallIdx, offset: Math.round(w.length / 2), width: 90, height: 210, sill: 0 }
    : { id: uid("p"), type: "window", wall: wallIdx, offset: Math.round(w.length / 2), width: Math.min(120, Math.round(w.length - 20)), height: 140, sill: 90 };
  if (w.length < o.width + 10) { toast("Duvar bu açıklık için kısa.", true); return; }
  // Ortası doluysa duvar boyunca boş bir yer ara.
  if (E.openingProblems(room, o).length) {
    for (let s = Math.ceil(o.width / 2); s <= w.length - o.width / 2; s += 5) {
      if (!E.openingProblems(room, { ...o, offset: s }).length) { o.offset = s; break; }
    }
  }
  if (E.openingProblems(room, o).length) { toast("Bu duvarda yer yok: " + E.openingProblems(room, o)[0], true); return; }
  api.commit(withRoom({ ...room, openings: [...room.openings, o] }));
  S.selection = { kind: "opening", roomId: room.id, id: o.id };
  renderAll();
}

function rotateSelected(deg) {
  const s = S.selection;
  if (!s || s.kind !== "item") return;
  const v = variant(), it = v.furniture.find((f) => f.id === s.id);
  api.commit(S.project, replaceItem(v, { ...it, rot: E.normAngle((it.rot || 0) + deg) }));
}

function nudge(dx, dy) {
  const s = S.selection;
  if (!s || s.kind !== "item") return false;
  const v = variant(), it = v.furniture.find((f) => f.id === s.id);
  api.commit(S.project, replaceItem(v, { ...it, x: it.x + dx, y: it.y + dy }));
  return true;
}

function duplicateSelected() {
  const s = S.selection;
  if (!s || s.kind !== "item") return;
  const v = variant(), it = v.furniture.find((f) => f.id === s.id);
  const ri = E.roomIndexAt(S.project, it);
  let copy = { ...it, id: uid("m"), x: it.x + 20, y: it.y + 20 };
  if (ri >= 0) copy = E.autoPlace(S.project, v, S.catalog, ri, copy) || copy;
  api.commit(S.project, { ...v, furniture: [...v.furniture, copy] });
  S.selection = { kind: "item", id: copy.id };
  renderAll();
}

function deleteSelected() {
  const s = S.selection;
  if (!s) return;
  if (s.kind === "item") {
    const v = variant();
    S.selection = null;
    api.commit(S.project, { ...v, furniture: v.furniture.filter((f) => f.id !== s.id) });
  } else if (s.kind === "opening") {
    const room = roomById(s.roomId);
    S.selection = { kind: "room", id: room.id };
    api.commit(withRoom({ ...room, openings: room.openings.filter((o) => o.id !== s.id) }));
  } else if (s.kind === "room") {
    deleteRoom(s.id);
  }
}

function deleteRoom(id) {
  const room = roomById(id);
  const n = S.project.variants.reduce((a, v) => a + v.furniture.filter((f) => E.pointInPolygon(f, room.points)).length, 0);
  if (!confirm(`"${room.name}" silinsin mi?${n ? ` İçindeki ${n} mobilya (bütün varyantlarda) da silinir.` : ""}`)) return;
  S.selection = null;
  api.commit(E.removeRoom(S.project, id, S.catalog));
}

function captureThumb() {
  const v = variant();
  const thumb = view.snapshot(360);
  // Küçük resim geçmişe yazılmaz; geri almayla kaybolması anlamsız olur.
  S.project = { ...S.project, variants: S.project.variants.map((x) => (x.id === v.id ? { ...x, thumb } : x)) };
  save();
}

async function compareVariants(ids) {
  const shots = [];
  const cur = S.project.activeVariantId;
  for (const id of ids) {
    const v = S.project.variants.find((x) => x.id === id);
    const st = S.styles.get(v.styleId);
    view.update({ project: S.project, variant: v, catalog: S.catalog, style: st, selection: null, issues: [] });
    await new Promise((r) => requestAnimationFrame(r));
    shots.push({ name: v.name, style: st.name, src: view.snapshot(1000) });
  }
  S.project.activeVariantId = cur;
  update3d();
  modal(`<div class="compare">${shots.map((s) => `<figure><img src="${s.src}" alt=""><figcaption>${esc(s.name)} <small class="hint">${esc(s.style)}</small></figcaption></figure>`).join("")}</div>`);
}

function modal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
}

let toastTimer = 0;
function toast(msg, error) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error", !!error);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), error ? 5000 : 2200);
}

// ---------------------------------------------------------------- olay bağlama
function bindLeft() {
  const body = $("#tab-body");
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act, id = t.dataset.id;
    const rid = selectedRoomId(), room = roomById(rid);
    switch (act) {
      case "select-room": api.select({ kind: "room", id }); break;
      case "add-rect": {
        const w = +$("#new-w").value, d = +$("#new-d").value;
        if (!(w >= 50 && d >= 50)) { toast("En ve boy en az 50 cm olmalı.", true); return; }
        const r = E.newRectRoom(S.project, uid("oda"), $("#new-name").value || "Oda", $("#new-kind").value, w, d, 260);
        api.commit({ ...S.project, rooms: [...S.project.rooms, r] });
        S.selection = { kind: "room", id: r.id };
        renderAll();
        plan.fit();
        break;
      }
      case "draw": plan.startDrawing(); renderTopbar(); break;
      case "add-door": addOpening(room, +t.dataset.wall, "door"); break;
      case "add-window": addOpening(room, +t.dataset.wall, "window"); break;
      case "select-opening": api.select({ kind: "opening", roomId: rid, id }); break;
      case "delete-opening": api.commit(withRoom({ ...room, openings: room.openings.filter((o) => o.id !== id) })); break;
      case "delete-room": deleteRoom(rid); break;
      case "add-item": addItem(t.dataset.type); break;
      case "set-style": {
        const v = variant();
        api.commit(S.project, { ...v, styleId: id });
        break;
      }
      case "apply-set": { const ri = S.project.rooms.findIndex((r) => r.id === rid); if (ri >= 0) applySet([ri]); break; }
      case "apply-set-all": applySet(S.project.rooms.map((_, i) => i)); break;
      case "clear-room": { const ri = S.project.rooms.findIndex((r) => r.id === rid); if (ri >= 0) clearRoom(ri); break; }
      case "activate-variant": {
        if (e.target.closest("label")) return;
        if (id === S.project.activeVariantId) return;
        captureThumb();
        S.project = { ...S.project, activeVariantId: id };
        S.selection = null;
        save(); renderAll();
        break;
      }
      case "dup-variant": {
        const v = variant();
        const d = E.duplicateVariant(v, uid("v"), v.name + " (kopya)", () => uid("m"));
        d.thumb = v.thumb;
        api.commit({ ...S.project, variants: [...S.project.variants, d], activeVariantId: d.id });
        break;
      }
      case "new-variant": {
        const v = { id: uid("v"), name: "Varyant " + (S.project.variants.length + 1), styleId: variant().styleId, furniture: [] };
        api.commit({ ...S.project, variants: [...S.project.variants, v], activeVariantId: v.id });
        break;
      }
      case "rename-variant": {
        const v = variant();
        const n = prompt("Varyantın adı", v.name);
        if (n && n.trim()) api.commit(S.project, { ...v, name: n.trim() });
        break;
      }
      case "delete-variant": {
        const v = variant();
        if (S.project.variants.length < 2 || !confirm(`"${v.name}" silinsin mi?`)) return;
        const rest = S.project.variants.filter((x) => x.id !== v.id);
        api.commit({ ...S.project, variants: rest, activeVariantId: rest[0].id });
        break;
      }
      case "thumb": captureThumb(); renderTab(); break;
      case "compare": compareVariants(S.comparePick); break;
      case "open-photo": {
        if (e.target.closest("button")) return;
        const p = S.photos.find((x) => x.id === id);
        modal(`<div class="lightbox"><img src="${p.url}" alt=""><p class="hint">${esc(p.name)}</p></div>`);
        break;
      }
      case "depth-photo": {
        e.stopPropagation();
        openDepth(S.photos.find((x) => x.id === id));
        break;
      }
      case "layer-center": {
        const L = S.layers.find((x) => x.id === id);
        const pts = S.project.rooms.flatMap((r) => r.points);
        const b = pts.length ? E.bbox(pts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        setLayerTransform(L, E.centerLayerOn(L.transform, L.box, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
        break;
      }
      case "layer-delete": {
        const L = S.layers.find((x) => x.id === id);
        if (!confirm(`"${L.name}" katmanı silinsin mi?`)) return;
        S.layers = S.layers.filter((x) => x.id !== id);
        if (L.image) URL.revokeObjectURL(L.image);
        store.deleteLayer(id).then(syncLayers);
        break;
      }
      case "delete-photo": {
        e.stopPropagation();
        store.deletePhoto(id).then(loadPhotos);
        break;
      }
    }
  });

  body.addEventListener("change", (e) => {
    const t = e.target;
    const act = t.dataset.act;
    const room = roomById(selectedRoomId());
    if (t.id === "photo-input") { addPhotos(t.files); return; }
    if (t.id === "layer-input") { const f = t.files[0]; t.value = ""; if (f) addLayerFile(f); return; }
    if (act && act.startsWith("layer-")) {
      const L = S.layers.find((x) => x.id === t.dataset.id);
      if (act === "layer-vis") { L.visible = t.checked; persistLayer(L); syncLayers(); }
      if (act === "layer-plan") { L.planVisible = t.checked; persistLayer(L); plan.render(); }
      if (act === "layer-flip") setLayerTransform(L, { ...L.transform, flip: t.checked });
      if (act === "layer-t") setLayerTransform(L, { ...L.transform, [t.dataset.field]: parseFloat(t.value) });
      return;
    }
    switch (act) {
      case "room-name": if (t.value.trim()) api.commit(withRoom({ ...room, name: t.value.trim() })); break;
      case "room-kind": api.commit(withRoom({ ...room, kind: t.value })); break;
      case "room-height": { const h = +t.value; if (h >= 180 && h <= 600) api.commit(withRoom({ ...room, height: h })); else { toast("Tavan 180–600 cm arası olmalı.", true); renderTab(); } break; }
      case "wall-len": { const L = +t.value; if (L >= 20) api.commit(withRoom(E.stretchWall(room, +t.dataset.wall, L))); else renderTab(); break; }
      case "op-field": opField(room, t); break;
      case "photo-room": S.photoRoomId = t.value; renderTab(); break;
      case "compare-pick": {
        const pick = new Set(S.comparePick || []);
        if (t.checked) pick.add(t.dataset.id); else pick.delete(t.dataset.id);
        S.comparePick = [...pick].slice(-2);
        renderTab();
        break;
      }
    }
  });
}

function opField(room, t) {
  const o = room.openings.find((x) => x.id === t.dataset.id);
  const v = +t.value;
  if (!(v >= 0)) return renderAll();
  const next = { ...o, [t.dataset.field]: v };
  const p = E.openingProblems(room, next);
  if (p.length) { toast("Yapılamadı: " + p[0], true); renderAll(); return; }
  api.commit(withRoom({ ...room, openings: room.openings.map((x) => (x.id === o.id ? next : x)) }));
}

function bindRight() {
  const el = $("#right");
  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const v = variant(), s = S.selection;
    const it = s && s.kind === "item" ? v.furniture.find((f) => f.id === s.id) : null;
    switch (t.dataset.act) {
      case "select-item": api.select({ kind: "item", id: t.dataset.id }); break;
      case "rotate": rotateSelected(90); break;
      case "duplicate": duplicateSelected(); break;
      case "delete-item": deleteSelected(); break;
      case "item-dim-reset": { const { w, d, h, ...rest } = it; api.commit(S.project, replaceItem(v, rest)); break; }
      case "item-color-reset": {
        const colors = { ...(it.colors || {}) };
        delete colors[t.dataset.slot];
        api.commit(S.project, replaceItem(v, { ...it, colors }));
        break;
      }
      case "select-opening": api.select({ kind: "opening", roomId: s.roomId, id: t.dataset.id }); break;
      case "delete-opening": deleteSelected(); break;
    }
  });
  el.addEventListener("change", (e) => {
    const t = e.target, v = variant(), s = S.selection;
    const it = s && s.kind === "item" ? v.furniture.find((f) => f.id === s.id) : null;
    switch (t.dataset.act) {
      case "item-dim": { const n = +t.value; if (n > 0) api.commit(S.project, replaceItem(v, { ...it, [t.dataset.field]: n })); break; }
      case "item-rot": api.commit(S.project, replaceItem(v, { ...it, rot: E.normAngle(+t.value || 0) })); break;
      case "item-color": api.commit(S.project, replaceItem(v, { ...it, colors: { ...(it.colors || {}), [t.dataset.slot]: t.value } })); break;
      case "op-field": opField(roomById(s.roomId), t); break;
    }
  });
}

function bindTop() {
  $("#project-name").addEventListener("change", (e) => { if (e.target.value.trim()) api.commit({ ...S.project, name: e.target.value.trim() }); });
  $("#undo").onclick = undo;
  $("#redo").onclick = redo;
  document.querySelectorAll("#layout-seg button").forEach((b) => (b.onclick = () => setLayout(b.dataset.layout)));
  document.querySelectorAll("#mode-seg button").forEach((b) => (b.onclick = () => {
    if (b.dataset.mode === "walk" && S.layout === "plan") setLayout("split");
    view.setMode(b.dataset.mode);
    renderTopbar();
  }));
  $("#cutaway").onchange = (e) => view.setCutaway(e.target.checked);
  $("#fit").onclick = () => { plan.fit(); view.frame(); };
  $("#shot").onclick = async () => {
    const blob = await view.pngBlob();
    download(blob, `${S.project.name} - ${variant().name}.png`);
  };
  $("#export").onclick = () => {
    const p = { ...S.project, variants: S.project.variants.map(({ thumb, ...v }) => v) };
    download(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }), `${S.project.name}.json`);
    closeMenu();
  };
  $("#import").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    closeMenu();
    if (!f) return;
    let p;
    try { p = JSON.parse(await f.text()); } catch { toast("Dosya JSON değil.", true); return; }
    const errs = E.validateProject(p, S.catalog);
    (p.variants || []).forEach((v) => { if (!S.styles.has(v.styleId)) errs.push("bilinmeyen stil: " + v.styleId); });
    if (errs.length) { modal(`<h3>İçe aktarılamadı</h3><ul>${errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`); return; }
    if (!confirm("Mevcut proje bununla değiştirilsin mi? (Geri alınabilir.)")) return;
    api.commit(p);
    S.selection = null;
    plan.fit(); view.hasFramed = false; renderAll();
  };
  $("#new-project").onclick = () => {
    closeMenu();
    if (!confirm("Boş bir proje başlatılsın mı? (Geri alınabilir.)")) return;
    const vid = uid("v");
    api.commit(E.emptyProject({ variant: vid }));
    S.selection = null; plan.fit(); renderAll();
  };
  $("#demo-project").onclick = () => {
    closeMenu();
    if (!confirm("Örnek ev yüklensin mi? (Geri alınabilir.)")) return;
    api.commit(demoProject());
    S.selection = null; plan.fit(); view.hasFramed = false; renderAll();
  };
}

function closeMenu() { document.querySelector(".menu").open = false; }

function setLayout(l) {
  S.layout = l;
  const m = $("#layout");
  m.classList.remove("split", "plan", "threed");
  m.classList.add(l === "3d" ? "threed" : l);
  if (l === "plan" && view.mode === "walk") view.setMode("orbit");
  try { localStorage.setItem("ev-layout", l); } catch {}
  renderTopbar();
  requestAnimationFrame(() => { plan.render(); view.resize(); });
}

function bindKeys() {
  window.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
    if (typing) return;
    if (view.mode === "walk") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); return; }
    if (plan.drawing) {
      if (e.key === "Enter") { plan.finishDrawing(); renderTopbar(); }
      if (e.key === "Escape") { plan.cancelDrawing(); renderTopbar(); }
      if (e.key === "Backspace") { plan.drawing.points.pop(); plan.render(); }
      return;
    }
    if (e.key === "Escape") { api.select(null); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
    if (e.key.toLowerCase() === "r" && !mod) { rotateSelected(e.shiftKey ? 15 : 90); return; }
    const step = e.shiftKey ? 10 : 1;
    const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir && nudge(...dir)) e.preventDefault();
  });
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- fotoğraflar
async function loadPhotos() {
  S.photos.forEach((p) => URL.revokeObjectURL(p.url));
  const list = await store.listPhotos().catch(() => []);
  S.photos = list.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) }));
  if (S.tab === "photos") renderTab();
}

async function addPhotos(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    await store.addPhoto({ id: uid("f"), roomId: S.photoRoomId, name: f.name, blob: f, added: new Date().toISOString() });
  }
  await loadPhotos();
  toast(`${files.length} fotoğraf eklendi.`);
}

// ---------------------------------------------------------------- örnek ev
function demoProject() {
  const vid = uid("v");
  const p = E.emptyProject({ variant: vid });
  p.name = "Örnek ev";
  const R = (name, kind, x, y, w, d) => ({ id: uid("oda"), name, kind, height: 265, points: E.rectPoints(x, y, w, d), openings: [] });
  const salon = R("Salon", "salon", 0, 0, 480, 400);
  const yatak = R("Yatak odası", "yatak", 480, 0, 340, 400);
  const mutfak = R("Mutfak", "mutfak", 0, 400, 300, 260);
  const banyo = R("Banyo", "banyo", 300, 400, 180, 260);
  salon.openings = [
    { id: uid("p"), type: "window", wall: 0, offset: 240, width: 180, height: 160, sill: 60 },
    { id: uid("k"), type: "door", wall: 1, offset: 320, width: 90, height: 210, sill: 0 },
    { id: uid("k"), type: "door", wall: 2, offset: 80, width: 80, height: 210, sill: 0 },
    { id: uid("k"), type: "door", wall: 2, offset: 330, width: 90, height: 210, sill: 0 },
    { id: uid("p"), type: "window", wall: 3, offset: 200, width: 120, height: 140, sill: 90 }
  ];
  yatak.openings = [{ id: uid("p"), type: "window", wall: 0, offset: 170, width: 140, height: 140, sill: 90 }];
  mutfak.openings = [{ id: uid("p"), type: "window", wall: 2, offset: 150, width: 100, height: 110, sill: 105 }];
  banyo.openings = [{ id: uid("p"), type: "window", wall: 2, offset: 90, width: 50, height: 60, sill: 150 }];
  p.rooms = [salon, yatak, mutfak, banyo];
  let v = p.variants[0];
  v.name = "Japandi";
  const st = S.styles.get("japandi");
  p.rooms.forEach((room, ri) => {
    const set = st.sets[room.kind] || [];
    v = E.applyStyleSet(p, v, S.catalog, st, ri, set.map(() => uid("m"))).variant;
  });
  const v2 = E.duplicateVariant(v, uid("v"), "Endüstriyel", () => uid("m"));
  v2.styleId = "endustriyel";
  p.variants = [v, v2];
  p.activeVariantId = v.id;
  return p;
}

// ---------------------------------------------------------------- başlat
async function init() {
  const [cat, idx] = await Promise.all([
    fetch("data/furniture.json").then((r) => r.json()),
    fetch("styles/index.json").then((r) => r.json())
  ]);
  S.catalog = cat.items;
  S.categories = cat.categories;
  const styles = await Promise.all(idx.styles.map((id) => fetch(`styles/${id}.json`).then((r) => r.json())));
  styles.forEach((s) => S.styles.set(s.id, s));
  S.styleOrder = idx.styles;

  const saved = await store.loadProject();
  if (saved && !E.validateProject(saved, S.catalog).length) S.project = saved;
  else {
    if (saved) console.warn("Kayıtlı proje geçersiz, örnek ev yüklendi:", E.validateProject(saved, S.catalog));
    S.project = demoProject();
    save();
  }

  plan = new Plan2D($("#plan"), api);
  view = new View3D($("#view"), {
    onSelect: (sel) => api.select(sel),
    onModeChange: () => { renderTopbar(); update3d(); }
  });

  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
    S.tab = b.dataset.tab;
    if (S.tab === "variants" && view.mode !== "walk" && S.layout !== "plan") captureThumb();
    renderTab();
  }));
  bindLeft(); bindRight(); bindTop(); bindKeys();
  let layout = "split";
  try { layout = localStorage.getItem("ev-layout") || "split"; } catch {}
  setLayout(layout);
  renderAll();
  requestAnimationFrame(() => plan.fit());
  loadPhotos();
  loadLayers();
  window.__ev = { S, api, E, view, plan, addLayerFile }; // tarayıcı konsolundan ve duman testinden erişim için
}

init().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<p style="padding:24px">Uygulama açılamadı: ${esc(e.message)}. Dosyalar bir web sunucusundan açılmalı (file:// ile değil).</p>`;
});
