# Kaynaklar

Uygulamanın dayandığı araçlar ve iddialar, bağlantısıyla. Sürüme bağlı bilgiler Eylül
2026'da kontrol edildi.

## Kullanılanlar (1. aşama)

- **three.js 0.186.1** — 3B sahne, `OrbitControls`, `PointerLockControls`,
  `RoundedBoxGeometry`, `RoomEnvironment`. npm'deki güncel sürüm kontrol edilerek sabitlendi.
  <https://threejs.org/docs/>
- **Renk sıcaklığı → RGB** (`kelvinToRgb`): Tanner Helland'ın yaklaşımı. Kırmızı, yeşil
  ve mavi için 6600 K'nin altında/üstünde ayrı logaritmik/üstel eğriler; 1000–40000 K için,
  görsel amaçlı, kolorimetrik olarak tam değil.
  <https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html>

## Mobilya ölçüleri

`data/furniture.json`'daki ölçüler **tipik başlangıç değerleridir, bir kaynaktan
alınmadı.** Her parçanın en, derinlik ve yüksekliği uygulamada tek tek değiştirilebilir;
gerçek bir mobilyanın ölçüsü bilindiğinde o yazılmalı.

## Tarama, video ve fotoğraf (kullanılanlar ve araştırılanlar)

- **Kullanılan sürümler:** `@sparkjsdev/spark` 2.2.0 (three ≥ 0.180 ister),
  `@huggingface/transformers` 4.3.0 (`dist/transformers.min.js`, ONNX Runtime içinde),
  model `onnx-community/depth-anything-v2-small`. three.js'in `USDZLoader`, `GLTFLoader`,
  `OBJLoader`, `PLYLoader`'ı. Testte USDZ ve GLB, three'nin kendi dışa aktarıcılarıyla
  üretilip geri okunuyor; gerçek bir RoomPlan dosyasıyla bu ortamda denenemedi.
  <https://huggingface.co/onnx-community/depth-anything-v2-small>
- **Fotoğraftan derinlik (2. aşama):** Depth Anything V2 Small, transformers.js ile
  tarayıcıda WebGPU'da çalışıyor; en küçük model fp16'da ~50 MB. Çıktısı *göreli* derinlik —
  metrik ölçü için kullanıcının bilinen bir ölçü (kapı yüksekliği gibi) vermesi gerekiyor.
  - <https://github.com/DepthAnything/Depth-Anything-V2>
  - <https://github.com/huggingface/transformers.js/tree/v3/examples/webgpu-video-depth-estimation>
- **LiDAR (3. aşama):** LiDAR'lı iPhone/iPad Pro gerekir. Ücretsiz uygulamalar USDZ/DXF
  dışa aktarıyor: OpenPlan3D Capture (açık kaynak, hesapsız; PNG/SVG/DXF/PDF/USDZ),
  Lagarsoft LiDAR Scanner (DXF, USDZ). Apple'ın RoomPlan uygulamasının ücretsiz katmanı 5
  modelle sınırlı.
  - <https://openplan3d.com/capture>
  - <https://lagarsoft.com/lidar-scanner/>
  - <https://apps.apple.com/us/app/roomplan-interior-3d-scanner/id1658425563>
- **AI görselleştirme (4. aşama):** Web Stable Diffusion (MLC) tamamen tarayıcıda, WebGPU
  ile çalışıyor; kaynağına göre testler ağırlıkla Apple Silicon'da yapılmış, Windows'ta
  sürücü sorunları bildirilmiş. Bu yüzden deneysel ve donanıma bağlı.
  - <https://websd.mlc.ai/>
- **Videodan 3B (5. aşama):**
  - Görüntüleme: Spark — three.js için Gaussian splat oluşturucu; `.ply`, `.spz`, `.splat`,
    `.ksplat` okuyor, splat'ler normal three.js nesnesi olarak sahneye giriyor.
    <https://sparkjs.dev/> · <https://github.com/sparkjsdev/spark>
  - Eğitim: Brush — WebGPU üstünde, tarayıcıda da çalışan Gaussian splat eğiticisi; ancak
    COLMAP kamera pozlarıyla gelen görüntüler istiyor ve tarayıcıda yalnız Chrome 134+
    (Windows/macOS) destekleniyor. Poz çıkarma tarayıcıda olmadığından ilk sürümde Brush
    masaüstünde çalıştırılıp `.ply` yüklenecek.
    <https://github.com/ArthurBrussee/brush> ·
    <https://radiancefields.com/gaussian-splatting-in-browser-brush>

## Fotoğraftan oda

- **Kapı ölçüsü (varsayılan 200 cm yükseklik):** Türkiye'de iç kapı kanadı genişlikte 80–90,
  yükseklikte 200–210 cm; en yaygın ölçü 80×200. Kasa boşluğu 205–210 cm. Kaynaklar bu
  aralıkta ayrışıyor; yöntem yalnız yüksekliği kullandığından varsayılan olarak en yaygın
  kanat yüksekliği 200 alındı, kullanıcı kendi kapısını yazar.
  <https://antalyakapi.com.tr/standart-oda-kapisi-olculeri.html> ·
  <https://www.caliskanlarkapi.com/blog/2026-standart-kapi-olculeri-ic-banyo-dis-ve-amerikan-kapilar> ·
  <https://www.kalekilit.com.tr/tr/medya/blog/ic-kapi-nasil-olmali>
- **iPhone 16 Plus:** ana kamera 26 mm, ultra geniş 13 mm (35 mm karşılığı); LiDAR yok
  (yalnız 16 Pro / Pro Max'te).
  <https://support.apple.com/en-in/121030> ·
  <https://www.simplywise.com/blog/which-iphones-have-lidar/>
- **35 mm karşılığı → piksel odak:** f_px = f35 · köşegen_px / 43.27 (36×24 mm karenin
  köşegeni). Görüntünün en/boy oranından bağımsız.
- **Metre veren derinlik modeli tarayıcıda yok:** Depth Anything V2'nin "Metric" sürümleri
  transformers.js için ONNX'e çevrilemiyor (açık issue). Ölçek bu yüzden kapıdan geliyor.
  <https://github.com/huggingface/transformers.js/issues/1476>
- **HEIC:** Chrome, Edge ve Firefox HEIC göstermiyor; Safari gösteriyor. Gerekirse
  `heic-to` 1.5.2 ile JPEG'e çevriliyor; odak uzaklığı `exifr` 7.1.3 (lite: JPEG ve HEIC
  okur) ile.
  <https://www.heicify.com/guides/heic-browser-support> · <https://github.com/MikeKovarik/exifr>
- **Doğrulama:** `selftest` bilinen bir sentetik kamerayla kapıyı ve köşeleri izdüşürüp
  odayı ±1 cm geri çıkarıyor; ±2 px gürültüde belirsizlik aralığı gerçek ölçüyü kapsıyor.
  `smoke` three.js ile render edilmiş bir oda fotoğrafında arayüzden dokunarak 380×420 cm'lik
  odayı %4 içinde buluyor. Gerçek bir iPhone fotoğrafıyla doğruluk henüz ölçülmedi.
