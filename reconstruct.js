// Fotoğraflardan 3B: fotoğraflar Depth Anything 3'ün ücretsiz çevrimiçi demosuna
// (Hugging Face) gönderilir, dönen scene.glb nokta bulutudur. Umut'un kararı: gizlilik
// endişesi yok, en kaliteli yol. Bu dosya yalnız demoyla konuşur; odayı engine.js çıkarır.

const E = globalThis.EvEngine;
export const SPACE = "depth-anything/depth-anything-3";
const MAX_SIDE = 1600; // model zaten ~500 px'te çalışır; yüklemeyi kısaltır

async function shrink(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (k === 1 && blob.type === "image/jpeg") { bmp.close && bmp.close(); return blob; }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
  } catch {
    return blob;
  }
}

// photos: [{blob, name}] → Blob (scene.glb). onStatus: ilerleme metni.
export async function reconstruct(photos, onStatus) {
  // Test kancası: tarayıcı testinde demo yerine sahte bir yeniden kurucu verilebilir.
  if (typeof window !== "undefined" && window.__evReconstruct) return window.__evReconstruct(photos, onStatus);

  onStatus("Depth Anything 3'e bağlanılıyor…");
  const { Client, handle_file } = await import("@gradio/client");
  let app;
  try {
    app = await Client.connect(SPACE);
  } catch (e) {
    throw new Error("demoya bağlanılamadı (kapalı ya da uykuda olabilir): " + (e.message || e));
  }
  const ep = E.da3Endpoints(await app.view_api());
  if (ep.error) throw new Error(ep.error);

  onStatus(`${photos.length} fotoğraf hazırlanıyor…`);
  const files = [];
  for (const p of photos) {
    const b = await shrink(p.blob);
    files.push(handle_file(new File([b], (p.name || "foto").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })));
  }

  onStatus(`${photos.length} fotoğraf yükleniyor…`);
  const up = await app.predict(ep.upload, [null, files, 10]);
  const targetDir = up && up.data && up.data[1];
  if (!targetDir || typeof targetDir !== "string") throw new Error("demo fotoğrafları kabul etmedi");

  onStatus("3B hesaplanıyor (sırada bekleme olabilir; genelde 1–3 dakika)…");
  const res = await app.predict(ep.run, E.da3RunArgs(targetDir));
  const out = res && res.data && res.data[0];
  const url = out && (out.url || (typeof out === "string" ? out : null));
  if (!url) throw new Error("demo 3B dosyası döndürmedi" + (res && res.data && res.data[1] ? ": " + String(res.data[1]).slice(0, 200) : ""));

  onStatus("3B indiriliyor…");
  const r = await fetch(url);
  if (!r.ok) throw new Error("3B dosyası indirilemedi (" + r.status + ")");
  return await r.blob();
}
