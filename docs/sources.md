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

## Sonraki aşamalar için araştırılanlar

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
