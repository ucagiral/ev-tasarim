# Ev Tasarım

Evin planını çiz, bir stil seç, 2B planda düzenle ve 3B'de dolaş. Masaüstü tarayıcı için
yazıldı; telefonda açılır ama rahat değildir.

Sunucu yok, hesap yok. Proje ve fotoğraflar **yalnız açtığınız tarayıcıda** (IndexedDB)
saklanır; başka bir cihaza taşımak için *Dosya → Dışa aktar*. Dışa aktarma fotoğrafları
içermez.

## Çalıştırma

- **Yayında:** GitHub Pages açıksa `https://ucagiral.github.io/ev-tasarim/`.
  (Ayarlar → Pages → Branch: `main`, klasör: `/ (root)`.)
- **Yerelde:** dosyalar bir web sunucusundan açılmalı, `file://` ile değil:
  `npx http-server -c-1 -p 8080 .` ya da `python3 -m http.server 8080`, sonra
  `http://localhost:8080`.

three.js `cdn.jsdelivr.net` üzerinden yüklenir (sürüm `index.html`'deki importmap'te sabit).

## Neler yapılabiliyor (1. aşama)

- **2B plan:** dikdörtgen oda ekle ya da tıklayarak çiz; köşeleri sürükle, kenar ortasından
  köşe ekle, köşeye çift tıklayıp sil; duvar ölçüsüne tıklayıp boyunu yaz. Bitişik odalar
  ortak duvarı kendiliğinden paylaşır. Kapı ve pencereler duvar boyunca sürüklenir.
- **3B:** *Döndür* kipinde fareyle çevir; kameraya dönük duvarlar saydamlaşır. *Yürü*
  kipinde W A S D ile göz hizasında dolaş (Esc çıkar).
- **12 stil:** Japandi, İskandinav, modern minimal, endüstriyel, klasik, bohem, mid-century,
  Akdeniz, rustik, art deco, wabi-sabi, kıyı. Stil zemini, duvarı, mobilya renklerini ve
  ışık sıcaklığını değiştirir; her stilin her oda türü için bir mobilya seti vardır.
- **Mobilya:** 40 parça. Tıklayınca odada boş bir yere konur: halı ve masalar ortaya,
  sandalyeler masanın çevresine yüzü masaya dönük, geri kalanı duvar dibine. Çakışma, odadan
  taşma ve kapının açılma alanını kapatma sağ panelde "Sorunlar" altında listelenir.
- **Varyantlar:** aynı ev için farklı stil ve yerleşimler; ikisini aynı kamera açısından
  yan yana karşılaştır.
- **Fotoğraflar:** her odaya referans fotoğrafı ekle.
- Geri al / yinele, PNG görüntü indirme, JSON dışa/içe aktarma.

## Sonraki aşamalar

| Aşama | Ne | Durum |
|---|---|---|
| 2 | Fotoğraftan derinlik (Depth Anything V2, tarayıcıda) + bilinen bir ölçüyle ölçek → tahmini oda | planlandı |
| 3 | LiDAR taramasını içe aktarma (iPhone uygulamalarının USDZ/DXF çıktısı) | planlandı |
| 4 | Tarayıcı içi AI görselleştirme (Stable Diffusion, WebGPU), önce/sonra kaydırıcısı | planlandı, deneysel |
| 5 | Videodan 3B (Gaussian splat görüntüleme; eğitim Brush masaüstünde) | planlandı, deneysel |

Kaynaklar ve neden bu araçlar: [`docs/sources.md`](docs/sources.md).

## Yapı

| Dosya | Görev |
|---|---|
| `engine.js` | Bütün kurallar: geometri, duvar parçaları, çakışma, otomatik yerleşim, doğrulama. DOM yok, saat yok, rastgele yok. |
| `app.js` | Durum, geri al/yinele, kayıt, paneller. |
| `plan2d.js` | SVG plan editörü. |
| `view3d.js`, `furniture3d.js`, `textures.js` | three.js sahnesi, ilkel geometriden mobilya, canvas'ta çizilen zemin dokuları. |
| `store.js` | IndexedDB. |
| `styles/*.json` | Stiller — veri, kod değil. Yeni stil = yeni dosya + `styles/index.json`'a bir satır. |
| `data/furniture.json` | Mobilya kataloğu. |

### Veri şekli

```jsonc
{
  "version": 1, "name": "Evim", "wallThickness": 12,
  "rooms": [{
    "id": "oda-…", "name": "Salon", "kind": "salon", "height": 260,
    "points": [{ "x": 0, "y": 0 }, …],            // cm, iç ölçü, x sağa y aşağı
    "openings": [{ "id": "k-…", "type": "door", "wall": 1, "offset": 150,   // duvar başından merkeze
                   "width": 90, "height": 210, "sill": 0 }]
  }],
  "variants": [{
    "id": "v-…", "name": "Japandi", "styleId": "japandi",
    "furniture": [{ "id": "m-…", "type": "sofa3", "x": 240, "y": 46, "rot": 0,   // merkez, derece
                    "w": 200, "colors": { "fabric": "#aabbcc" } }]              // isteğe bağlı: elle ölçü/renk
  }],
  "activeVariantId": "v-…"
}
```

Duvar `i`, `points[i] → points[i+1]`'dir. Mobilyanın ön yüzü yerel +y; `rot` planda saat yönünde.

## Test

```
node tools/selftest.mjs            # motor kuralları, node'da, bağımlılıksız
npm i && node tools/smoke.mjs      # gerçek tarayıcıda uçtan uca; ekran görüntüleri shots/ altına
```
