# Çalışma kuralları

Bu dosya her oturumun başında okunur; kalıcı talimatlar buraya yazılır.

Umut'un ev tasarım uygulaması: fotoğraflardan ve ölçülerden evin planını kurar, stil
uygular, 2B ve 3B'de gezdirir. Mekanik ayrıntılar `README.md`'de.

## 1. Önce sor

Bir istek iki farklı şey anlamına gelebiliyorsa, bir ölçü ya da davranış belirtilmemişse
ve cevap tasarımı değiştiriyorsa — yazmadan önce birkaç net soru sor. Cevabı burada,
README'de ya da `docs/` altında yazılıysa sorma, bak.

## 2. Yazıya geçir

Konuşmada çıkan her tercih, ölçü, düzeltme ve karar — sorulmadan — bir dosyaya yazılır.
Umut'un evi hakkında söylediği her şey (bir odanın ölçüsü, beğenmediği bir stil, bir
mobilyanın gerçek boyu) veridir ve bizim değerimiz olarak kaydedilir; yayımlanmış bir
aralıktan önce gelir.

## 3. Kurallar motorda

- **Her kural `engine.js`'de**, DOM'suz, saatsiz, rastgelesiz saf fonksiyon olarak. Kimlikler
  argümandır. Tarayıcı bu dosyayı yükler, `tools/selftest.mjs` aynı dosyayı node'da çalıştırır.
  Bir kuralı değiştir ya da ekle → bir kontrol ekle → çalıştır. "Çalışıyor" demeden önce
  hem `selftest` hem `smoke` geçmeli.
- **Kaydedilen proje her zaman geçerlidir.** Bir düzenleme yeni bir `validateProject` hatası
  getiriyorsa `app.js` onu geri alır ve nedenini söyler. Bunun etrafından dolaşan yol ekleme.
- **Stiller veridir.** `styles/<id>.json`; yeni stil kod değişikliği gerektirmez. Şema
  `styleProblems()`'ta ve test ediliyor.
- **Otomatik yerleşim sessizce üst üste koymaz.** Yer yoksa `null` döner ve kullanıcıya
  hangi parçanın sığmadığı söylenir.
- **Elle verilen değer kazanır.** Bir parçaya elle verilen ölçü ya da renk, stil değişince
  korunur.

## 4. Tahmin tahmin olarak görünür

Fotoğraftan, derinlik modelinden ya da AI'dan gelen her değer "tahmini" diye işaretlenir ve
elle düzeltilebilir; ölçülmüş gibi gösterilmez. Mobilya kataloğundaki ölçüler tipik
başlangıç değerleridir, kaynaklı değildir — bu `data/furniture.json`'da ve
`docs/sources.md`'de yazılı.

## 5. Kaynak göster

Bir araç, model ya da yöntem hakkındaki iddia `docs/sources.md`'ye bağlantısıyla yazılır.
Sürüme bağlı her şey (kütüphane API'leri, tarayıcı desteği, model boyutları) kullanmadan
önce aranır.

## 6. Gizlilik

Repo herkese açık. Evin fotoğrafları repoya girmez; yalnız tarayıcıda (IndexedDB) durur.
Dışa aktarılan JSON fotoğraf içermez. Bunu değiştiren bir özellik önce sorulur.

## 7. Değişikliği yerine ulaştırma

Dalda çalış, PR aç, birleştir — Pages `main`'den yayınlar.
