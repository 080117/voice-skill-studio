// 客户端存储：BYOK keys / 声纹元数据（localStorage）+ 参考音频（IndexedDB）
import type { ApiKeysState, VoiceProfile } from "./types";

const KEYS_LS = "vss.keys";
const VOICES_LS = "vss.voices";
const DB_NAME = "vss-audio";
const DB_STORE = "refAudio";

export function loadKeys(): ApiKeysState | null {
  try {
    const raw = localStorage.getItem(KEYS_LS);
    return raw ? (JSON.parse(raw) as ApiKeysState) : null;
  } catch {
    return null;
  }
}

export function saveKeys(keys: ApiKeysState) {
  localStorage.setItem(KEYS_LS, JSON.stringify(keys));
}

export function loadVoices(): VoiceProfile[] {
  try {
    const raw = localStorage.getItem(VOICES_LS);
    return raw ? (JSON.parse(raw) as VoiceProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveVoices(voices: VoiceProfile[]) {
  localStorage.setItem(VOICES_LS, JSON.stringify(voices));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putRefAudio(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getRefAudio(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => { db.close(); resolve((req.result as Blob) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteRefAudio(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export { newId as newVoiceId } from "./id";

