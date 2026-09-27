// Yüklenen görselleri hazırlar: iPhone'un HEIC fotoğraflarını tarayıcı gösteremiyorsa
// JPEG'e çevirir (heic-to, yalnız gerektiğinde yüklenir) ve odak uzaklığını EXIF'ten okur
// (exifr). Fotoğraf hiçbir yere gönderilmez; her şey tarayıcıda olur.

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"];

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function isImageFile(file) {
  return (file.type || "").startsWith("image/") || IMAGE_EXT.includes(extOf(file.name));
}

function isHeicName(file) {
  return /image\/hei[cf]/i.test(file.type || "") || ["heic", "heif"].includes(extOf(file.name));
}

async function decodes(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    bmp.close && bmp.close();
    return true;
  } catch {
    return false;
  }
}

async function readFocal35(file) {
  try {
    const exifr = await import("exifr");
    const t = await exifr.parse(file, ["FocalLengthIn35mmFormat", "FocalLength"]);
    const f = t && (t.FocalLengthIn35mmFormat || null);
    return f && f > 5 && f < 400 ? Math.round(f) : null;
  } catch (e) {
    console.warn("EXIF okunamadı", file.name, e);
    return null;
  }
}

// → { blob, name, f35 } ya da { error }
export async function prepareImage(file) {
  const f35 = await readFocal35(file);
  if (await decodes(file)) return { blob: file, name: file.name, f35 };
  if (!isHeicName(file)) return { error: "bu tarayıcı dosyayı açamadı" };
  try {
    const { heicTo } = await import("heic-to");
    const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    return { blob: jpeg, name: file.name.replace(/\.hei[cf]$/i, ".jpg"), f35 };
  } catch (e) {
    console.error(e);
    return { error: "HEIC dosyası JPEG'e çevrilemedi" };
  }
}
