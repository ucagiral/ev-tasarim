# Ev Tasarım

Evin planını çiz, bir stil seç, 2B planda düzenle ve 3B'de dolaş. Masaüstü tarayıcı için
yazıldı; telefonda açılır ama rahat değildir.

Sunucu yok, hesap yok. Proje ve fotoğraflar **yalnız açtığınız tarayıcıda** (IndexedDB)
saklanır; başka bir cihaza taşımak için *Dosya → Dışa aktar*. Dışa aktarma fotoğrafları
içermez.

## Çalıştırma

- **Yayında:** `https://ucagiral.github.io/ev-tasarim/`. Bir kez açılması gerekir:
  repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Sonra her
  `main` güncellemesinde `.github/workflows/pages.yml` testleri çalıştırıp yayınlar
  (açılmadan önceki çalıştırmalar "Create Pages site failed" ile düşer; ayar yapılınca
  Actions → pages → *Re-run* yeterli).
- **Yerelde:** dosyalar bir web sunucusundan açılmalı, `file://` ile değil:
  `npx http-server -c-1 -p 8080 .` ya da `python3 -m http.server 8080`, sonra
  `http://localhost:8080`.

three.js, Spark, transformers.js, exifr ve heic-to `cdn.jsdelivr.net` üzerinden yüklenir (sürümler
`index.html`'deki importmap'te sabit). Derinlik modeli ilk kullanımda `huggingface.co`'dan
iner.

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

## Otomatik oda: yalnız fotoğraflar

**Fotoğraf** sekmesinde odanın fotoğraflarını ekleyin — hepsi bu. Hiçbir şey seçilmez,
dokunulmaz: uygulama fotoğrafları Depth Anything 3'ün ücretsiz çevrimiçi demosuna
([depth-anything/depth-anything-3](https://huggingface.co/spaces/depth-anything/depth-anything-3),
`@gradio/client` ile) gönderir, gelen 3B nokta bulutundan odanın enini, derinliğini ve tavan
yüksekliğini çıkarır ve odayı plana ekler ("tahmini" işaretli). Fotoğraflar o odaya bağlanır.

- İyi sonuç: her yönden, birbiriyle örtüşen 5–20 fotoğraf; duvar dipleri ve tavan görünsün.
- **Hugging Face anahtarı gerekli:** demo her oda için 3 dk GPU istiyor, girişsiz günlük hak
  2 dk. Ücretsiz hesabın anahtarıyla günde 5 dk (≈1 oda), PRO ile 40 dk. Anahtar Fotoğraf
  sekmesinde bir kez girilir, yalnız bu tarayıcıda saklanır.
- Fotoğraflar Hugging Face'e gider (Umut'un kararı). Demo meşgulse ya da kotası dolmuşsa
  neden gösterilir ve "Tekrar dene" çıkar.
- Bir odanın grubundaki fotoğraflarla "Bu odayı fotoğraflardan yeniden ölç" o odayı
  yeniden boyutlandırır.
- Otomatik çalışmazsa: demoyu elle kullanıp scene.glb'yi bırakmak (Fotoğraf sekmesinde
  "Otomatik çalışmazsa").
- Kapıyı ya da köşeleri işaretleme yolu **kaldırıldı** (Umut: "kapı işaretlemek
  istemiyorum"). Motordaki kapı geometrisi (`poseFromDoor`, `roomFromPhoto`) testleriyle
  duruyor ama arayüzde yok.

Nasıl (`roomFromPointCloud`): yukarı yön ve zemin/tavan RANSAC ile düzlem aranarak, duvar
yönü duvar noktalarının iz düşüm histogramının en keskin olduğu açıyla, duvar yerleri
uçlardaki yoğunluk tepeleriyle bulunur. Varsayım: oda dikdörtgen. Az görünen duvar ve
olağan dışı tavan yüksekliği uyarı olarak gösterilir.

Demo bağlantısı (`reconstruct.js`) canlı demoyla test edilmedi: geliştirme ortamı
huggingface.co'ya erişemiyor. Uç adları ve argümanlar demonun kaynak kodundan
(`gradio_app.py`) alındı ve çalışma anında demonun kendi arayüz tanımıyla (`view_api`)
doğrulanıyor; uyuşmazsa çağırmadan önce durup nedenini söylüyor. Akışın geri kalanı
(fotoğraf → 3B → oda → plan) sahte bir 3B yanıtıyla uçtan uca test ediliyor.

## Tarama ve fotoğraftan 3B

**Tarama** sekmesi evin gerçek bir taramasını altlık olarak yükler; odalar üzerine
çizilir ya da onunla hizalanır. Dosya yalnız tarayıcıda açılır ve saklanır.

| Kaynak | Dosya | Nasıl görünür |
|---|---|---|
| LiDAR (iPhone/iPad Pro) | Tarama uygulamasının **USDZ** çıktısı | 3B'de model; planda üstten kesit altlığı (duvarlar koyu) |
| 3B model | **GLB/glTF** (tek dosya), **OBJ**, **.ply** örgü/nokta bulutu | aynı |
| Video | Videodan Gaussian splat eğiticisiyle (ör. Brush) üretilen **.ply/.spz/.splat/.ksplat** | 3B'de splat (Spark) |

Her katmanın konumu, açısı, ölçeği, yüksekliği ve "ters çevir"i (y-aşağı kaydedilmiş
splat'ler için) ayarlanır; "Plana ortala" evin ortasına getirir. LiDAR metre verir, ölçek
1 kalmalı; videodan splat'in ölçeği keyfîdir, bilinen bir ölçüye göre ayarlanır.

**Fotoğraf** sekmesinde her fotoğrafın **3B** düğmesi (deneysel) fotoğrafın derinliğini
tarayıcıda Depth Anything V2 ile tahmin eder ve fotoğrafı döndürülebilir bir kabartmaya
çevirir. İlk seferde ~50 MB model iner; WebGPU varsa onunla, yoksa WebAssembly ile çalışır.
Çıktı **göreli** derinliktir — ölçü değildir, plana ölçü olarak aktarılmaz.

### Yapılmayan: AI ile fotogerçekçi yeniden stillendirme

Planlanmıştı; bu sürümde yok. Ücretsiz ve tarayıcı içi olması istendi, ama sürümü
sabitlenip bir sayfaya gömülebilen ve doğrulanabilen bir img2img kütüphanesi bulunamadı:
Web Stable Diffusion (MLC) bir demo olarak yayında, bir kütüphane olarak değil, ve kaynağına
göre ağırlıkla Apple Silicon'da denenmiş. Doğrulanamayan bir özelliği koymak yerine
bırakıldı. Stiller şimdilik 3B sahnede malzeme ve renk olarak uygulanır; her stilin
`aiPrompt` alanı ileride bu iş için hazır.

Kaynaklar ve neden bu araçlar: [`docs/sources.md`](docs/sources.md).

## Yapı

| Dosya | Görev |
|---|---|
| `engine.js` | Bütün kurallar: geometri, duvar parçaları, çakışma, otomatik yerleşim, doğrulama. DOM yok, saat yok, rastgele yok. |
| `app.js` | Durum, geri al/yinele, kayıt, paneller. |
| `plan2d.js` | SVG plan editörü. |
| `view3d.js`, `furniture3d.js`, `textures.js` | three.js sahnesi, ilkel geometriden mobilya, canvas'ta çizilen zemin dokuları. |
| `layers.js` | Tarama katmanları: dosyayı açma (USDZ/glTF/OBJ/PLY, splat), plan altlığı. |
| `depth.js` | Fotoğraftan derinlik (transformers.js) ve kabartma görüntüleyici. |
| `media.js` | Görsel hazırlama: HEIC→JPEG (heic-to), odak uzaklığı (exifr). |
| `reconstruct.js` | Fotoğrafları Depth Anything 3 demosuna gönderip scene.glb alır (`@gradio/client`). |
| `store.js` | IndexedDB: proje, fotoğraflar, katmanlar. |
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
npm i --ignore-scripts && node tools/smoke.mjs   # gerçek tarayıcıda uçtan uca; ekran görüntüleri shots/ altına
```
