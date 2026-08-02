/**
 * ZipLayer.js — zero-config, client-side archive SDK (v3).
 *
 * Engine: fflate (MIT) vendored at ../lib/fflate.mjs — no build step, no
 * runtime fetches, 100% local in the browser.
 *
 * v1: in-memory X-Ray + extraction (bytes/File/Blob).
 * v2: URL sources stream through a module Web Worker into the Origin Private
 * File System (OPFS) — flat RAM on 1 GB+ archives, backpressured handshake
 * (init→ready, chunk→chunkDone, end→done). Non-OPFS browsers fall back to
 * the v1 in-memory path.
 * v3: extractToLocalFolder() streams URL sources straight into a user-picked
 * OS folder — the worker holds the FileSystemDirectoryHandle (structured-
 * cloneable) and writes files directly to disk, skipping the OPFS round-trip.
 */
import { Unzip, unzipSync } from "../lib/fflate.mjs";

async function toBytes(source) {
  if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (source && typeof source.arrayBuffer === "function") return new Uint8Array(await source.arrayBuffer()); // File / Blob
  throw new TypeError("xray() expects a URL string, ArrayBuffer, TypedArray, File or Blob");
}

// Strip drive letters / leading slashes and reject path traversal ("..", ".").
function sanitize(name) {
  return name.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
}

// Best-effort MIME types so blob URLs render natively (PDF viewer, images, media).
const MIME = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac",
  aac: "audio/aac", opus: "audio/opus", ogg: "audio/ogg",
  txt: "text/plain", md: "text/markdown", json: "application/json", csv: "text/csv",
  html: "text/html", htm: "text/html", xml: "application/xml", log: "text/plain",
  js: "text/javascript", mjs: "text/javascript", css: "text/css", yml: "text/yaml",
  yaml: "text/yaml", zip: "application/zip",
};
function mimeOf(name) {
  const i = name.lastIndexOf(".");
  const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  return MIME[ext] || "application/octet-stream";
}

// PRD 2.1 Task 2.3 — parse the ZIP structure without decompressing file data.
function scanTree(bytes) {
  const entries = [];
  const unzip = new Unzip();
  unzip.onfile = (f) => {
    const path = sanitize(f.name);
    if (!path) return;
    entries.push({
      path,
      name: path.split("/").pop(),
      dir: f.name.endsWith("/"),
      size: f.originalSize ?? f.size ?? 0,
      compressedSize: f.size ?? 0,
    });
  };
  unzip.push(bytes, true);
  return entries;
}

// Phase 2 capability: streaming into OPFS needs OPFS + module Worker.
function canStream() {
  return typeof navigator !== "undefined" &&
    typeof Worker !== "undefined" &&
    !!navigator.storage?.getDirectory;
}

// Shared streaming core (v2 X-Ray + v3 extract): fetch a URL and feed the
// worker one transferred chunk at a time, waiting for the handshake ack after
// each (backpressure → flat RAM). The worker must already be set up (init or
// extractStart sent); it answers "ready" before the first chunk. Errors or a
// timeout reject the pending ack so callers degrade instead of hanging.
async function streamFetchToWorker(url, worker, { onProgress, onMsg } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;

  let ack = null; // the single pending handshake resolver
  let err = null;
  const settle = () => { const a = ack; ack = null; a && a(); };
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "file") onMsg?.(m);
    else if (m.type === "error") { err = new Error(m.message); settle(); }
    else if (m.type === "ready" || m.type === "chunkDone" || m.type === "done") settle();
  };
  worker.onerror = (e) => { err = e.error || new Error("worker error"); settle(); };

  // Wait for the next handshake ack. One in flight at a time; a timeout guards
  // against any silent worker failure so we degrade instead of hanging at 0%.
  const awaitAck = (timeoutMs = 20000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (ack) { ack = null; reject(new Error("streaming timed out")); }
    }, timeoutMs);
    ack = () => { clearTimeout(t); err ? reject(err) : resolve(); };
  });

  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    // transfer an exact-size buffer so no copy is made in the worker
    const buf = value.byteLength === value.buffer.byteLength ? value.buffer : value.slice().buffer;
    worker.postMessage({ type: "chunk", buf }, [buf]);
    await awaitAck(); // "chunkDone" (backpressure: next chunk only after this is consumed)
    if (total) onProgress?.(Math.min(99, Math.round((got / total) * 100)));
  }
  worker.postMessage({ type: "end" });
  await awaitAck(); // "done" — all files flushed
  onProgress?.(100);
  return { got, total };
}

// PRD 2.2 — stream a URL through the worker into OPFS (X-Ray) with backpressure.
async function streamArchive(url, { onProgress } = {}) {
  const session = `zl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const worker = new Worker(new URL("./zip-worker.js", import.meta.url), { type: "module" });
  const archive = new OPFSArchive(worker, session, url);
  try {
    worker.postMessage({ type: "init", session });
    const { got } = await streamFetchToWorker(url, worker, {
      onProgress,
      onMsg: (m) => archive._tree.push(m), // X-Ray tree from worker "file" messages
    });
    archive.size = got; // real streamed bytes (content-length may be absent/0)
    archive._done = true;
    return archive;
  } catch (e) {
    await archive.destroy(); // terminate worker + wipe partial OPFS session
    throw e;
  }
}

export class ZipLayer {
  /** PRD 1.3.2 — hardware/browser capability tiers. */
  static getDeviceCapabilities() {
    const browser = typeof navigator !== "undefined" && typeof window !== "undefined";
    const opfs = browser && !!navigator.storage?.getDirectory;
    const worker = browser && typeof Worker !== "undefined";
    const fsa = browser && typeof window.showDirectoryPicker === "function";
    return { canPreview: opfs && worker, canExtractLocal: opfs && worker && fsa, mustFallback: !(opfs && worker) };
  }

  /** Phase 2 — can URL sources stream into OPFS on this device? */
  static canStream() {
    return canStream();
  }

  /** PRD 2.2 — X-Ray an archive. URL strings stream (OPFS+worker); raw bytes/File/Blob parse in memory. */
  static async xray(source, opts = {}) {
    if (typeof source === "string" && canStream()) {
      try {
        return await streamArchive(source, opts);
      } catch (err) {
        // Graceful degradation (PRD 1.3.2): fall back to in-memory parsing.
        console.warn("[ziplayer] streaming failed, falling back to in-memory:", err.message);
      }
    }
    return new Archive(await toBytes(source));
  }

  /** PRD 3.1 — stream an archive straight into a user-chosen OS folder. */
  static async extractToLocalFolder(source, opts = {}) {
    return (await ZipLayer.xray(source, opts)).extractToLocalFolder(opts);
  }
}

/** In-memory archive (bytes / File / Blob / legacy browsers). */
class Archive {
  constructor(bytes) {
    this._bytes = bytes;
    this._tree = null;
  }

  get size() { return this._bytes?.length ?? 0; }

  /** PRD 2.3 — sanitized array of {path, name, dir, size, compressedSize}. */
  getFileTree() {
    return (this._tree ??= scanTree(this._bytes));
  }

  /** PRD 2.4 — pull one file out as a native HTML5 File (with MIME type). */
  async extractFile(path) {
    const data = unzipSync(this._bytes)[path];
    if (!data) throw new Error(`"${path}" not found in archive`);
    return new File([data], path.split("/").pop(), { type: mimeOf(path) });
  }

  /** PRD 2.5 — release the held bytes (GLBA-friendly cleanup). */
  destroy() {
    this._bytes = null;
    this._tree = null;
  }

  /** PRD 3.1 — write every file to a folder the user picks via showDirectoryPicker. */
  async extractToLocalFolder({ onProgress } = {}) {
    if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
      throw new Error("showDirectoryPicker() unsupported — Tier 3 fallback applies");
    }
    const root = await window.showDirectoryPicker({ mode: "readwrite" });
    const files = this.getFileTree().filter((e) => !e.dir);
    const data = unzipSync(this._bytes);
    for (let i = 0; i < files.length; i++) {
      const e = files[i];
      const parts = e.path.split("/");
      const name = parts.pop();
      let dir = root;
      for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
      const handle = await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable();
      await w.write(data[e.path]);
      await w.close();
      onProgress?.(Math.round(((i + 1) / files.length) * 100));
    }
    return { count: files.length };
  }
}

/** Phase 2/3 — archive whose files live in OPFS (X-Ray) or stream to an OS folder. */
class OPFSArchive {
  constructor(worker, session, url) {
    this._worker = worker;
    this._session = session;
    this._url = url; // source URL, re-streamed for direct-to-OS extraction
    this.size = 0;   // compressed bytes streamed (set after the X-Ray pass)
    this._tree = [];
    this._done = false;
  }

  /** PRD 2.3 — tree assembled from worker "file" messages (no RAM footprint). */
  getFileTree() { return this._tree; }

  async _sessionDir() {
    const root = await navigator.storage.getDirectory();
    const sessions = await root.getDirectoryHandle("ziplayer-sessions", { create: true });
    return sessions.getDirectoryHandle(this._session);
  }

  /** PRD 2.4 — pull one file out of OPFS as a native HTML5 File (with MIME type). */
  async extractFile(path) {
    const parts = path.split("/");
    const name = parts.pop();
    let dir = await this._sessionDir();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    const handle = await dir.getFileHandle(name);
    const f = await handle.getFile();
    return new File([f], name, { type: mimeOf(path), lastModified: f.lastModified });
  }

  /** PRD 3.1 / v3 — stream the archive straight into a user-picked OS folder.
   * The worker holds the FileSystemDirectoryHandle (structured-cloneable) and
   * writes every file directly to disk — no OPFS round-trip, flat RAM even on
   * GB-sized archives. The URL source is re-streamed through the same
   * backpressured handshake as the X-Ray pass. */
  async extractToLocalFolder({ onProgress } = {}) {
    if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
      throw new Error("showDirectoryPicker() unsupported — Tier 3 fallback applies");
    }
    if (!this._url) throw new Error("URL source required for direct-to-OS streaming");
    const root = await window.showDirectoryPicker({ mode: "readwrite" });
    this._worker.postMessage({ type: "extractStart", root }); // handle clones into the worker
    await streamFetchToWorker(this._url, this._worker, { onProgress });
    return { count: this._tree.filter((e) => !e.dir).length };
  }

  /** PRD 2.5 — terminate the worker and wipe this session's OPFS storage. */
  async destroy() {
    this._worker?.terminate();
    this._worker = null;
    this._tree = [];
    try {
      const root = await navigator.storage.getDirectory();
      const sessions = await root.getDirectoryHandle("ziplayer-sessions");
      await sessions.removeEntry(this._session, { recursive: true });
    } catch { /* session already gone */ }
  }
}
