// Client-side persistence: cheap settings in localStorage, the heavy work
// session (uploaded photos as blobs + the generated result data URL) in
// IndexedDB, which comfortably holds multi-megabyte values. Every operation
// fails soft — persistence is a convenience, never a blocker.

export interface PersistedFile {
  blob: Blob;
  name: string;
  type: string;
}

export interface PersistedSession {
  mode: "file" | "url";
  main: PersistedFile | null;
  ref: PersistedFile | null;
  /** Legacy single-slot field from older sessions. */
  extra?: PersistedFile | null;
  extras?: PersistedFile[];
  productTitle: string | null;
  productSku: string | null;
  galleryImages: string[];
  mainUrl: string | null;
  refUrl: string | null;
  /** Gallery images picked as extra references in URL mode. */
  extraUrls?: string[];
  result: {
    image: string;
    promptUsed: string;
    analysis: string | null;
    analysisFailed: boolean;
    upscaleFailed?: boolean;
    model?: string;
    pipeline?: "deterministic" | "generative";
    finalize?: "recompose" | "resize" | null;
    finalizeFailed?: boolean;
    deterministicReason?: string | null;
  };
  savedPath: string | null;
  /** Groups all attempts on this product photo in the server events log. */
  sessionId?: string | null;
  attempt?: number;
}

export interface PersistedSettings {
  presetId: string;
  engineId: string;
  analyze: boolean;
  upscale: boolean;
  upscalerId: string;
  note: string;
  mode: "file" | "url";
  pipeline?: "auto" | "deterministic" | "generative";
}

const DB_NAME = "catalog-editor";
const STORE = "session";
const SESSION_KEY = "current";
const SETTINGS_KEY = "catalog-editor-settings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveSession(session: PersistedSession): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, "readwrite").put(session, SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    /* persistence is best-effort */
  }
}

export async function loadSession(): Promise<PersistedSession | null> {
  try {
    const db = await openDb();
    const session = await new Promise<PersistedSession | null>((resolve, reject) => {
      const request = tx(db, "readonly").get(SESSION_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return session?.result?.image ? session : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, "readwrite").delete(SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

export function saveSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* best-effort */
  }
}

export function loadSettings(): Partial<PersistedSettings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedSettings>) : null;
  } catch {
    return null;
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* best-effort */
  }
}
