/**
 * ZipLayer.js — zero-config, client-side archive SDK (v0).
 *
 * Engine: fflate (MIT) vendored at ../lib/fflate.mjs — no build step, no
 * runtime fetches, 100% local in the browser.
 *
 * v0 scope (YAGNI): in-memory X-Ray + extraction. Streaming-to-OPFS and the
 * inline Web Worker from the PRD are Phase 2.
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

export class ZipLayer {
  /** PRD 1.3.2 — hardware/browser capability tiers. */
  static getDeviceCapabilities() {
    const browser = typeof navigator !== "undefined" && typeof window !== "undefined";
    const opfs = browser && !!navigator.storage?.getDirectory;
    const fsa = browser && typeof window.showDirectoryPicker === "function";
    return { canPreview: opfs, canExtractLocal: opfs && fsa, mustFallback: !opfs };
  }

  /** PRD 2.2 — X-Ray an archive. Accepts a URL string or raw bytes/File/Blob. */
  static async xray(source) {
    return new Archive(await toBytes(source));
  }

  /** PRD 3.1 — stream an archive straight into a user-chosen OS folder. */
  static async extractToLocalFolder(source, opts = {}) {
    return (await ZipLayer.xray(source)).extractToLocalFolder(opts);
  }
}

class Archive {
  constructor(bytes) {
    this._bytes = bytes;
    this._tree = null;
  }

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
