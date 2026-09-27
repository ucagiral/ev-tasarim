// Fotoğraftan oda aracı: kapının dört köşesine ve odanın zemin köşelerine dokunulur,
// motor (roomFromPhoto) tahmini en ve derinliği hesaplar. Noktalar sürüklenerek
// düzeltilebilir. Hesap engine.js'de; burada yalnız dokunma ve gösterim var.

const E = globalThis.EvEngine;
const NS = "http://www.w3.org/2000/svg";

// Türkiye'de en yaygın iç kapı kanadı 80×200 cm; kasa boşluğu 205–210 (docs/sources.md).
export const DEFAULT_DOOR_HEIGHT = 200;
export const LENSES = [
  { label: "1x (26 mm)", f35: 26 },
  { label: "0.5x (13 mm)", f35: 13 },
  { label: "2x (52 mm)", f35: 52 }
];

export function openPhotoRoom(host, photo, { onAdd, onToast }) {
  const st = {
    door: [], floor: [],
    doorHeight: DEFAULT_DOOR_HEIGHT,
    f35: photo.f35 || 26,
    corner: false,
    img: { w: 0, h: 0 },
    drag: null
  };
  host.innerHTML = `
    <div class="pr">
      <div class="pr-stage"><img alt=""><svg class="pr-svg"></svg></div>
      <aside class="pr-side">
        <p class="pr-step" id="pr-step"></p>
        <div class="field"><span>Kapı yüksekliği</span><span><input type="number" id="pr-dh" value="${st.doorHeight}" min="150" max="260"> cm</span></div>
        <p class="hint">Kapı kanadının köşelerine dokunun. Türkiye'de yaygın kanat 200 cm; sizinki farklıysa değiştirin — sonuç doğrudan bununla ölçeklenir.</p>
        <div class="field"><span>Lens</span><select id="pr-lens">${LENSES.map((l) => `<option value="${l.f35}"${l.f35 === st.f35 ? " selected" : ""}>${l.label}</option>`).join("")}${LENSES.some((l) => l.f35 === st.f35) ? "" : `<option value="${st.f35}" selected>${st.f35} mm (EXIF)</option>`}</select></div>
        <p class="hint" id="pr-exif">${photo.f35 ? `Odak uzaklığı fotoğrafın EXIF bilgisinden okundu: ${photo.f35} mm.` : "Fotoğrafta odak uzaklığı bilgisi yok; hangi lensle çektiyseniz onu seçin."}</p>
        <label class="row"><input type="checkbox" id="pr-corner"> Odanın bir köşesinde durarak çektim</label>
        <div class="row"><button id="pr-undo">Son noktayı sil</button><button id="pr-reset">Baştan</button></div>
        <div id="pr-result"></div>
      </aside>
    </div>`;
  host.__pr = st; // test ve hata ayıklama için
  const img = host.querySelector("img");
  const svg = host.querySelector("svg");
  img.src = photo.url;
  img.onload = () => {
    st.img = { w: img.naturalWidth, h: img.naturalHeight };
    host.querySelector(".pr-stage").style.setProperty("--ar", st.img.w / st.img.h);
    svg.setAttribute("viewBox", `0 0 ${st.img.w} ${st.img.h}`);
    draw();
  };

  const $ = (s) => host.querySelector(s);
  $("#pr-dh").onchange = (e) => { const v = +e.target.value; if (v >= 150 && v <= 260) st.doorHeight = v; else e.target.value = st.doorHeight; draw(); };
  $("#pr-lens").onchange = (e) => { st.f35 = +e.target.value; draw(); };
  $("#pr-corner").onchange = (e) => { st.corner = e.target.checked; draw(); };
  $("#pr-undo").onclick = () => { if (st.floor.length) st.floor.pop(); else st.door.pop(); draw(); };
  $("#pr-reset").onclick = () => { st.door = []; st.floor = []; draw(); };

  function toImg(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * st.img.w, y: (e.clientY - r.top) / r.height * st.img.h };
  }
  svg.addEventListener("pointerdown", (e) => {
    const t = e.target.closest("[data-pt]");
    if (t) {
      const [list, i] = t.dataset.pt.split(":");
      st.drag = { list, i: +i };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const p = toImg(e);
    if (st.door.length < 4) st.door.push(p); else st.floor.push(p);
    draw();
  });
  svg.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    st[st.drag.list][st.drag.i] = toImg(e);
    draw(true);
  });
  svg.addEventListener("pointerup", () => { if (st.drag) { st.drag = null; draw(); } });

  function draw(light) {
    const r = Math.max(st.img.w, st.img.h) / 90;
    const parts = [];
    if (st.door.length >= 2) {
      const k = st.door.length === 4 ? E.sortRectCorners(st.door) : null;
      const poly = k ? [k.bl, k.br, k.tr, k.tl] : st.door;
      parts.push(`<polygon points="${poly.map((p) => `${p.x},${p.y}`).join(" ")}" class="pr-door" stroke-width="${r / 3}"/>`);
    }
    if (st.floor.length >= 2) parts.push(`<polyline points="${st.floor.map((p) => `${p.x},${p.y}`).join(" ")}" class="pr-floor" stroke-width="${r / 3}"/>`);
    st.door.forEach((p, i) => parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" class="pr-pt door" data-pt="door:${i}" stroke-width="${r / 4}"/>`));
    st.floor.forEach((p, i) => parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" class="pr-pt floor" data-pt="floor:${i}" stroke-width="${r / 4}"/><text x="${p.x + r * 1.4}" y="${p.y - r}" font-size="${r * 2}" stroke-width="${r / 3}" class="pr-label">${i + 1}</text>`));
    svg.innerHTML = parts.join("");
    $("#pr-step").innerHTML = st.door.length < 4
      ? `<b>1.</b> Kapının dört köşesine dokunun (${st.door.length}/4).`
      : `<b>2.</b> Odanın <b>zemin köşelerine</b> dokunun — duvarların zemine değdiği yerler. Görünen her köşe; karşı duvarın köşeleri derinliği verir. (${st.floor.length} köşe)`;
    if (!light) result();
  }

  function input() {
    return { door: st.door, floor: st.floor, image: st.img, f35: st.f35, doorHeight: st.doorHeight, cameraInCorner: st.corner };
  }

  function result() {
    const box = $("#pr-result");
    if (st.door.length < 4) { box.innerHTML = ""; return; }
    const r = E.roomFromPhoto(input());
    if (r.error) { box.innerHTML = `<p class="pr-err">${esc(r.error)}</p>`; return; }
    const sp = E.photoRoomSpread(input(), E.seededRandom(1), 60, 3);
    const range = (a) => (a ? ` <small>(${Math.round(a[0])}–${Math.round(a[1])})</small>` : "");
    box.innerHTML = `
      <h3>Tahmini oda</h3>
      <table class="summary">
        <tr><td>En</td><td>${Math.round(r.width)} cm${range(sp && sp.width)}</td></tr>
        <tr><td>Derinlik</td><td>${Math.round(r.depth)} cm${range(sp && sp.depth)}</td></tr>
        <tr><td>Kapı eni</td><td>${Math.round(r.doorWidth)} cm</td></tr>
        <tr><td>Kamera yüksekliği</td><td>${Math.round(r.cameraHeight)} cm</td></tr>
      </table>
      <p class="hint">Parantez: dokunuşlar 3 piksel kaysa çıkabilecek aralık. Kamera yüksekliği telefonu tuttuğunuz yüksekliğe yakınsa (genelde 120–160 cm) köşeler doğru işaretlenmiştir.</p>
      ${r.warnings.map((w) => `<p class="pr-err">${esc(w)}</p>`).join("")}
      <div class="field"><span>Oda türü</span><select id="pr-kind">${Object.entries(E.ROOM_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <button class="primary" id="pr-add">Plana oda olarak ekle</button>`;
    $("#pr-add").onclick = () => onAdd({ result: r, spread: sp, kind: $("#pr-kind").value, input: input() });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
