# AGENTS.md — ZipLayer knowledge file

This file teaches AI coding agents (and humans) how ZipLayer works and how to
build with it. Read it before editing. It is intentionally short — every line
pays rent.

---

## What ZipLayer is

A **zero-config, client-side zip download SDK + web component**. Instead of
forcing users to download one monolithic ZIP, it launches a wizard modal that
streams the archive into the browser, X-Rays the contents, and lets users grab
exactly what they need. No backend, no API keys, 100% in the browser.

Sister projects: MailLayer, MailLayer-Embedded (same "layers" family, pink accent).

---

## File map

| Path | What it is |
|---|---|
| `src/ziplayer.js` | The SDK (`ZipLayer` class). In-memory `Archive` + v2 streaming `OPFSArchive`. |
| `src/zip-worker.js` | Module Web Worker: streaming Unzip → writes files straight into OPFS. |
| `src/zip-layer-modal.js` | `<zip-layer-modal>` web component (the wizard UI). Imports the SDK. |
| `lib/fflate.mjs` | Vendored fflate (MIT, Arjun Barrett) — the only engine. No other deps. |
| `index.html` | Landing page + live demo (serves as the test page). |
| `privacy.html` | Privacy policy — "we collect nothing, never will". |
| `assets/JohnSmith-LoanFile.zip` | Example archive (fake mortgage loan file) used by the demo. |
| `server.mjs` | Zero-dep static file server for the preview (`npm run dev`). |
| `build.mjs` | Copies the static site into `dist/`. **No bundling, no minify.** |
| `package.json` | `name: "ziplayer"`, version, ESM `exports` map, jsDelivr/unpkg fields. |

---

## Architecture & the two paths

`ZipLayer.xray(source)` dispatches on input type:

1. **URL string + OPFS + Worker available** → **v2 streaming** (`streamArchive`):
   fetch reader chunks → transferred to the worker → fflate `Unzip` decompresses
   incrementally → worker writes each file straight into OPFS
   (`ziplayer-sessions/<session>/`). RAM stays flat even on GB-sized archives.
2. **Everything else** (bytes/File/Blob, or no OPFS/Worker) → **v1 in-memory**
   (`Archive`): whole archive in RAM, `unzipSync` on demand. Graceful fallback.

`getDeviceCapabilities()` reports `{ canPreview, canExtractLocal, mustFallback }`.
`ZipLayer.canStream()` = can a URL stream to OPFS here?

### The worker protocol (never break this)

Every step is handshaked so the main thread's backpressure loop can never
deadlock. The main loop sends ONE chunk at a time and waits for its ack:

```
main → worker: { type: "init", session }
worker → main: { type: "ready" } | { type: "error", message }
main → worker: { type: "chunk", buf }     (transferred ArrayBuffer)
worker → main: { type: "chunkDone" }      (one per chunk!) | { type: "error" }
main → worker: { type: "end" }
worker → main: { type: "done" }           | { type: "error" }
```

**History lesson:** v2 originally shipped missing the per-chunk `chunkDone`
ack → the main loop waited forever → modal hung at 0% on every device. The
worker MUST ack each chunk, and the SDK must reject pending acks on `error`
plus carry a 20s `awaitAck` timeout so any future worker failure degrades to
the in-memory fallback instead of hanging.

### fflate streaming — required incantations

`Unzip` from fflate does NOT auto-decompress:

```js
const u = new Unzip();
u.register(UnzipInflate);        // without this, deflate (method 8) errors
u.onfile = (file) => {
  file.ondata = (err, dat, final) => { /* write chunks; close on final */ };
  file.start();                   // without this, ondata NEVER fires
};
u.push(chunk, false);            // feed network chunks
u.push(new Uint8Array(0), true); // final flush
```

This is why the worker exists: `Unzip.push` is synchronous and would block the
UI thread on big archives.

---

## Hard rules & conventions (from the owner)

1. **YAGNI.** Build the simplest thing that works. Prefer one-line solutions.
2. **Local & frontend-only.** No backend, no third-party API keys, no servers.
   If a feature requires a backend or paid service, STOP and talk to the owner.
3. **Open source first.** Prefer zero-dep / MIT solutions. The only dependency
   is vendored fflate — do not add libraries casually.
4. **No build step in the source tree.** Modules are plain ESM that import each
   other relatively, so they work directly on GitHub Pages and jsDelivr.
   `build.mjs` only copies files. (A dist bundle is a backlog item, not now.)
5. **No npm publishing until the owner says so.** It's on the backlog.
6. **Mobile matters.** The demo is tested on phones — keep the modal usable at
   ~360px, wrap long paths, stack buttons, never let content overflow.
7. **Previews must render.** Extracted files are tagged with MIME types via
   `mimeOf()` so blob URLs render natively (PDF viewer, SVG, images, media).
8. **Privacy is a feature.** Nothing leaves the browser. `destroy()` wipes
   OPFS session storage (GLBA-friendly cleanup).

---

## Gotchas

- **`content-length` may be missing/0** (proxies). Track actual bytes read
  (`got`) for progress/footers, never rely on the header alone.
- **PDF previews:** use `<object type="application/pdf" data=blobUrl>` —
  Chromium often renders blob: PDFs blank inside `<iframe>`.
- **`File` MIME type:** OPFS `getFile()` returns an empty type; rebuild with
  `new File([f], name, { type: mimeOf(path) })` or previews break.
- **Path sanitizing:** strip drive letters/leading slashes and reject `..`
  before building OPFS paths or OS folder trees. Never trust zip entries.
- **`box-sizing`:** the modal's shadow DOM has `* { box-sizing:border-box }`;
  index.html needs the global reset too (added — keep it).
- **`navigator.storage` is read-only in Node 22+** — in tests, use
  `Object.defineProperty(globalThis, "navigator", { value: ..., configurable: true })`.
- **Module worker, not inline Blob:** `new Worker(new URL("./zip-worker.js",
  import.meta.url), { type: "module" })`. Zero config, works on Pages/jsDelivr.
  Relative imports inside the worker resolve against its own URL.

---

## Building with ZipLayer (consumer view)

Drop-in component (1 line):

```html
<zip-layer-modal src="https://portal.com/api/export.zip"></zip-layer-modal>
<script type="module">
  import "https://cdn.jsdelivr.net/gh/Spuds0588/ZipLayer@main/src/zip-layer-modal.js";
  document.querySelector("zip-layer-modal").open();
</script>
```

Headless:

```js
import { ZipLayer } from "./src/ziplayer.js";
const archive = await ZipLayer.xray("https://portal.com/api/export.zip", {
  onProgress: (pct) => console.log(pct + "%"),
});
const tree = archive.getFileTree();            // [{ path, name, dir, size, compressedSize }]
const file = await archive.extractFile(tree[0].path); // native File
await archive.extractToLocalFolder({ onProgress });   // Tier 1 only
archive.destroy();                              // wipes OPFS session
```

Both archive classes (`Archive`, `OPFSArchive`) expose the same API:
`getFileTree()`, `extractFile(path)`, `extractToLocalFolder()`, `destroy()`,
plus a `size` getter (bytes — use actual bytes read, not content-length).

---

## Dev commands & validation

```bash
npm run dev          # static preview server on $PORT (0.0.0.0)
npm run build        # copies site → dist/ (no bundling)
node --check src/*.js  # quick syntax check on all modules
```

Verification before claiming something works:
1. `node --check` all three src modules.
2. `npm run build` and confirm `dist/` contains `src/zip-worker.js`.
3. Run the Node worker-protocol test (fake OPFS recording writes):
   drive `init` → `ready` → chunks → `chunkDone` → `end` → `done`, then assert
   every file's written bytes equal `unzipSync` output byte-for-byte.
4. Curl the live preview for `/`, `/src/zip-worker.js`, `/assets/…zip` (200s).
5. Ideally click through the modal in a real browser (Chrome) — OPFS streaming
   is a browser-only path; Node can only test the worker logic in isolation.

---

## Backlog / roadmap (see PRD-ZipLayer_js.md, gitignored)

- **v3:** direct-to-OS streaming for `extractToLocalFolder` (worker holds the
  `FileSystemDirectoryHandle` — they ARE structured-cloneable per spec —
  skipping the OPFS round-trip; use transferable streams + `pipeTo`).
- **v3:** OPFS quota/eviction handling (`navigator.storage.estimate()`,
  `persist()`, friendly `QuotaExceededError`).
- **v4:** ZIP64 streaming verification, ESM+UMD dist bundle, npm publish (owner
  deferred), cross-browser + 500MB heap-flat test (owner wants a huge-file test
  soon — queue first), logo.
