// Tarayıcı içi kalıcı depo (IndexedDB). Proje ve fotoğraflar bu cihazda kalır; hiçbir
// yere gönderilmez. Başka cihaza taşımak için JSON dışa/içe aktarma kullanılır.

const DB_NAME = "ev-tasarim";
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
      if (!db.objectStoreNames.contains("photos")) {
        const s = db.createObjectStore("photos", { keyPath: "id" });
        s.createIndex("roomId", "roomId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadProject() {
  try {
    return await tx("projects", "readonly", (s) => req(s.get("current")));
  } catch (e) {
    console.warn("proje okunamadı", e);
    return null;
  }
}

export function saveProject(project) {
  return tx("projects", "readwrite", (s) => req(s.put(project, "current")));
}

export function listPhotos() {
  return tx("photos", "readonly", (s) => req(s.getAll()));
}

export function addPhoto(photo) {
  return tx("photos", "readwrite", (s) => req(s.put(photo)));
}

export function deletePhoto(id) {
  return tx("photos", "readwrite", (s) => req(s.delete(id)));
}

export function clearPhotos() {
  return tx("photos", "readwrite", (s) => req(s.clear()));
}
