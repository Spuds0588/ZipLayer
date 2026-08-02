// ZipLayer streaming worker (PRD 1.2 / 2.2 / 3.1).
// Decompresses a ZIP incrementally with fflate's streaming Unzip and writes
// each file's bytes straight to a FileSystemDirectoryHandle target:
//   - X-Ray pass (`init`):   writes into the Origin Private File System (OPFS)
//     under `ziplayer-sessions/<session>/`, so a 1 GB archive never sits in
//     RAM and nothing binary crosses the main thread.
//   - Extract pass (`extractStart`): writes directly into a user-picked OS
//     folder — the FileSystemDirectoryHandle is structured-cloneable, so it
//     travels into the worker via postMessage and the OPFS round-trip is
//     skipped entirely (v3 direct-to-OS streaming).
//
// Protocol (main ⇄ worker) — every step is handshaked so the main thread's
// backpressure loop can never deadlock:
//   main → worker: { type: "init", session }              (X-Ray pass)
//   main → worker: { type: "extractStart", root }         (OS pass — handle clones in)
//   worker → main: { type: "ready" } | { type: "error", message }
//   main → worker: { type: "chunk", buf }        (transferred ArrayBuffer)
//   worker → main: { type: "chunkDone" }         (one per chunk) | { type: "error" }
//   main → worker: { type: "end" }
//   worker → main: { type: "done" }              (all files flushed) | { type: "error" }
// Only the X-Ray pass emits { type: "file", ... } metadata messages.
//
// Module worker (not inline Blob): zero-config, no build step — resolves
// relative imports against the worker URL, so it works from GitHub Pages and
// jsDelivr exactly like any other module in the package.
import { Unzip, UnzipInflate } from "../lib/fflate.mjs";

// Mirror of the SDK's sanitizer: strip drive letters / leading slashes, drop
// traversal segments. Paths are used to build dirs/files, so no "..".
function sanitize(name) {
  return name.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
}

let sessionDir = null; // OPFS root for the X-Ray session
let osRoot = null;     // user-picked OS folder handle (v3 extract pass)
const open = new Map(); // path -> Promise<void> chained write (per-file order)
let stream = null;

// Build a fresh Unzip wired to the current target. `Unzip` does NOT
// auto-decompress: it needs `register(UnzipInflate)` and an explicit
// `file.start()` inside `onfile`, or ondata NEVER fires.
function makeStream() {
  const s = new Unzip();
  s.register(UnzipInflate);
  s.onfile = (file) => {
    const raw = file.name;
    const path = sanitize(raw);
    if (!path) return;
    const dir = raw.endsWith("/");
    if (!osRoot) {
      // X-Ray pass only — the main thread already has the tree on the OS pass.
      self.postMessage({
        type: "file",
        path,
        name: path.split("/").pop(),
        dir,
        size: file.originalSize ?? file.size ?? 0,
        compressedSize: file.size ?? 0,
      });
    }
    // Lazily open one writable per file and append chunks in order.
    let chain = Promise.resolve();
    file.ondata = (err, dat, final) => {
      if (err) {
        self.postMessage({ type: "error", message: err.message });
        return;
      }
      if (dir) return; // directory entries carry no payload
      chain = chain.then(async () => {
        const parts = path.split("/");
        const name = parts.pop();
        let d = osRoot ?? sessionDir;
        for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
        const handle = await d.getFileHandle(name, { create: true });
        const w = await handle.createWritable();
        if (dat.length) await w.write(dat);
        await w.close();
      }).catch((e) => self.postMessage({ type: "error", message: e.message }));
      open.set(path, chain);
    };
    file.start();
  };
  return s;
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      osRoot = null;
      open.clear();
      stream = makeStream();
      const root = await navigator.storage.getDirectory();
      const sessions = await root.getDirectoryHandle("ziplayer-sessions", { create: true });
      sessionDir = await sessions.getDirectoryHandle(msg.session, { create: true });
      self.postMessage({ type: "ready" }); // OPFS ready — main may start streaming
    } else if (msg.type === "extractStart") {
      osRoot = msg.root; // FileSystemDirectoryHandle (structured-cloneable)
      open.clear();
      stream = makeStream();
      self.postMessage({ type: "ready" }); // OS folder ready — main may start streaming
    } else if (msg.type === "chunk") {
      stream.push(new Uint8Array(msg.buf), false);
      self.postMessage({ type: "chunkDone" }); // ack: consumed, send the next chunk
    } else if (msg.type === "end") {
      stream.push(new Uint8Array(0), true); // final flush → last file's ondata(final)
      await Promise.all([...open.values()]); // all writables closed
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
};
