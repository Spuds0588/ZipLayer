// ZipLayer streaming worker (PRD 1.2 / 2.2).
// Decompresses a ZIP incrementally with fflate's streaming Unzip and writes
// each file's bytes straight into the Origin Private File System (OPFS), so a
// 1 GB archive never sits in RAM. OPFS handles live in the worker (same origin,
// same storage), so no binary data ever crosses the main thread.
//
// Protocol (main ⇄ worker) — every step is handshaked so the main thread's
// backpressure loop can never deadlock:
//   main → worker: { type: "init", session }
//   worker → main: { type: "ready" } | { type: "error", message }
//   main → worker: { type: "chunk", buf }        (transferred ArrayBuffer)
//   worker → main: { type: "chunkDone" }         (one per chunk) | { type: "error" }
//   main → worker: { type: "end" }
//   worker → main: { type: "done" }              (all files flushed) | { type: "error" }
//
// Module worker (not inline Blob): zero-config, no build step — resolves
// relative imports against the worker URL, so it works from GitHub Pages and
// jsDelivr exactly like any other module in the package.
import { Unzip, UnzipInflate } from "../lib/fflate.mjs";

// Mirror of the SDK's sanitizer: strip drive letters / leading slashes, drop
// traversal segments. Paths are used to build OPFS dirs/files, so no "..".
function sanitize(name) {
  return name.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
}

let sessionDir = null; // OPFS root for this archive session
const open = new Map(); // path -> Promise<void> chained write (per-file order)
const stream = new Unzip();

stream.register(UnzipInflate);
stream.onfile = (file) => {
  const raw = file.name;
  const path = sanitize(raw);
  if (!path) return;
  const dir = raw.endsWith("/");
  self.postMessage({
    type: "file",
    path,
    name: path.split("/").pop(),
    dir,
    size: file.originalSize ?? file.size ?? 0,
    compressedSize: file.size ?? 0,
  });
  // Lazily open one OPFS writable per file and append chunks in order.
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
      let d = sessionDir;
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

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      const root = await navigator.storage.getDirectory();
      const sessions = await root.getDirectoryHandle("ziplayer-sessions", { create: true });
      sessionDir = await sessions.getDirectoryHandle(msg.session, { create: true });
      self.postMessage({ type: "ready" }); // OPFS ready — main may start streaming
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
