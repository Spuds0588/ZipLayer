# AGENTS.md — ZipLayer for AI coding agents

This file teaches AI coding agents (and humans) how to **build with ZipLayer** —
add the drop-in modal or the headless SDK to any web app. It is written for
consumers integrating ZipLayer, not for maintaining ZipLayer itself. Keep it
short — every line pays rent.

---

## What ZipLayer is

A **zero-config, client-side zip download SDK + web component**. Instead of
forcing users to download one monolithic ZIP, it launches a wizard modal that
streams the archive into the browser, X-Rays the contents, and lets users grab
exactly what they need:

1. **Download selected files** — pick individual files and download them.
2. **Download files to folder** — stream everything into a user-picked OS folder.
3. **Download .zip** — grab the original archive, streamed natively.
4. **Preview** — PDFs, images, media, and text render inline before download.

No backend, no API keys, 100% in the browser. Streams archives with flat RAM
(Web Worker + OPFS), and degrades gracefully to in-memory parsing on
unsupported browsers. Sister projects: MailLayer, MailLayer-Embedded (same
"layers" family, pink accent).

---

## Quick start — drop-in component (1 line)

```html
<zip-layer-modal src="https://portal.com/api/export.zip"></zip-layer-modal>
<script type="module">
  import "https://cdn.jsdelivr.net/gh/Spuds0588/ZipLayer@main/src/zip-layer-modal.js";
  document.querySelector("zip-layer-modal").open();
</script>
```

Or host the repo yourself and import relatively:

```html
<script type="module">
  import "./src/zip-layer-modal.js";
  document.querySelector("zip-layer-modal").open();
</script>
```

That's it. The modal handles the entire flow: streaming progress → contents
X-Ray → download/preview actions. No build step, no framework required — it's a
vanilla web component that works in any page.

### Component attributes

| Attribute | Purpose |
|---|---|
| `src` | URL of the zip to stream. Required for streaming. |
| `title` | Header title (defaults to the `src` filename). |

### Component methods

| Method | Purpose |
|---|---|
| `open()` | Launch the modal (starts streaming if not already loaded). |
| `close()` | Dismiss the modal. |

---

## Headless SDK

Skip the UI and drive ZipLayer directly:

```js
import { ZipLayer } from "./src/ziplayer.js";

// X-Ray an archive — URL strings stream (flat RAM); bytes/File/Blob parse in memory
const archive = await ZipLayer.xray("https://portal.com/api/export.zip", {
  onProgress: (pct) => console.log(pct + "%"),
});

const tree = archive.getFileTree();                // [{ path, name, dir, size, compressedSize }]
const file = await archive.extractFile(tree[0].path); // native HTML5 File with MIME type
await archive.extractToLocalFolder({ onProgress });   // stream to a user-picked OS folder
archive.destroy();                                   // wipe session storage
```

### `ZipLayer` static API

| Member | Purpose |
|---|---|
| `xray(source, { onProgress })` | Returns an archive. `source` = URL string, `ArrayBuffer`, `TypedArray`, `File`, or `Blob`. URL strings stream through a Worker into OPFS when supported; everything else parses in memory. |
| `extractToLocalFolder(source, opts)` | One-shot: X-Ray + stream straight into a user-picked OS folder. |
| `canStream()` | `true` when URL sources can stream on this device (OPFS + Worker + secure context). |
| `getDeviceCapabilities()` | `{ canPreview, canExtractLocal, mustFallback }` — the capability tiers. |

### Archive API (same on both archive classes)

| Member | Purpose |
|---|---|
| `getFileTree()` | Sanitized `[{ path, name, dir, size, compressedSize }]` — directories included. |
| `extractFile(path)` | Pull one file out as a native `File` (MIME-tagged so it renders/downloads correctly). |
| `extractToLocalFolder({ onProgress })` | Prompt via `showDirectoryPicker()` and write all files to the chosen folder. Streaming archives skip OPFS entirely (direct-to-OS). In-memory archives write from RAM. |
| `destroy()` | Release memory and wipe the OPFS session (privacy-friendly cleanup). |
| `size` (getter) | Compressed bytes streamed/held — actual bytes, never guessed. |

---

## How it behaves (know before you ship)

- **Streaming (URL sources):** fetch reader chunks are transferred to a module
  Web Worker, decompressed incrementally with fflate, and written into OPFS —
  RAM stays flat even on GB-sized archives. Progress callbacks report real
  bytes read (never trusts a missing/zero `content-length`).
- **Graceful fallback:** if OPFS/Worker or a secure context isn't available,
  URL sources fall back to in-memory parsing automatically. Raw bytes/File/Blob
  always parse in memory. Your code doesn't need to branch.
- **Direct-to-OS extraction:** on Chromium-based browsers with the File System
  Access API, "download to folder" streams straight to the user's OS folder —
  no double-write, no OPFS quota concerns.
- **Previews:** PDFs render via `<object type="application/pdf">` (reliable in
  Chromium), images/media natively, text as plain text. Files are MIME-tagged
  so blob URLs render correctly.
- **Privacy:** nothing leaves the browser. `destroy()` wipes OPFS session
  storage — GLBA-friendly cleanup.

### Browser support

| Capability | Requires |
|---|---|
| Streaming + previews | Secure context (https/localhost), Chromium-family browsers, Worker support. |
| Direct-to-OS folder extraction | `window.showDirectoryPicker()` (Chromium-based desktop). |
| Everything else | Any modern browser — in-memory fallback keeps it functional. |

`getDeviceCapabilities()` tells you exactly which tier a device is on, so you
can hide or adapt UI if needed.

---

## Common integration gotchas

- **Missing `content-length`:** proxies often omit it. ZipLayer tracks actual
  bytes read, so progress/footers are correct regardless — don't add your own
  header-based logic.
- **PDF previews:** ZipLayer uses `<object>`, not `<iframe>` — Chromium renders
  blob: PDFs blank inside iframes. Don't "fix" previews by swapping to iframes.
- **MIME types from OPFS:** `getFile()` returns an empty type; ZipLayer rebuilds
  files with correct MIME tags so downloads and previews work. If a downloaded
  file has a generic type, you're bypassing `extractFile()` somewhere.
- **Secure context required:** streaming (Worker + OPFS) needs https or
  localhost. On plain http, `canStream()` returns false and ZipLayer falls back
  to in-memory — still functional, just not flat-RAM.
- **Relative `src`:** the modal's `src` resolves against your page URL — fine
  for same-origin zips; use absolute URLs for cross-origin sources.

---

## Where to go from here

- Live home page + demo: https://spuds0588.github.io/ZipLayer/
- Repo: https://github.com/Spuds0588/ZipLayer
- Example archive: `assets/JohnSmith-LoanFile.zip` (fake mortgage loan file)
- Engine: [fflate](https://github.com/101arrowz/fflate) (MIT, Arjun Barrett) —
  vendored, so ZipLayer has zero runtime dependencies.
