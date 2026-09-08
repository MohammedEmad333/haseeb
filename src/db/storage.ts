/**
 * Where the encrypted database image lives, per platform.
 *
 * The app talks to this port only; swapping IndexedDB for a Tauri filesystem
 * path or a Capacitor `Filesystem` directory is one adapter, not a rewrite.
 */

export interface BlobStore {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  /** Human-readable location, shown in Settings and in the README. */
  describe(): string;
}

/** Browser / Capacitor WebView / Tauri WebView: IndexedDB. */
class IndexedDbStore implements BlobStore {
  #db: Promise<IDBDatabase> | null = null;
  readonly #name = 'haseeb';
  readonly #store = 'files';

  #open(): Promise<IDBDatabase> {
    if (!this.#db) {
      this.#db = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.#name, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.#store)) db.createObjectStore(this.#store);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.#db;
  }

  async #tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.#open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(this.#store, mode);
      const request = run(tx.objectStore(this.#store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async read(key: string): Promise<Uint8Array | null> {
    const value = await this.#tx<ArrayBuffer | undefined>('readonly', (s) => s.get(key));
    return value ? new Uint8Array(value) : null;
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    // Store a plain ArrayBuffer: structured clone handles it everywhere,
    // including older WebViews that mishandle typed-array views.
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await this.#tx('readwrite', (s) => s.put(buffer, key));
  }

  async remove(key: string): Promise<void> {
    await this.#tx('readwrite', (s) => s.delete(key));
  }

  describe(): string {
    return 'IndexedDB · haseeb/files (متصفح أو تطبيق ويب مضمّن)';
  }
}

/** Node (tests, and any future headless tooling): a file on disk. */
class MemoryStore implements BlobStore {
  #files = new Map<string, Uint8Array>();

  async read(key: string): Promise<Uint8Array | null> {
    return this.#files.get(key) ?? null;
  }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    this.#files.set(key, bytes.slice());
  }
  async remove(key: string): Promise<void> {
    this.#files.delete(key);
  }
  describe(): string {
    return 'ذاكرة مؤقتة (اختبارات)';
  }
}

export function createBlobStore(): BlobStore {
  if (typeof indexedDB !== 'undefined') return new IndexedDbStore();
  return new MemoryStore();
}

export { IndexedDbStore, MemoryStore };
