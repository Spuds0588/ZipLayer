# 📦 ZipLayer

**A better zip download experience — 1 line of code.** *(v3)*

> 🌐 **Live demo / home page:** https://spuds0588.github.io/ZipLayer/ — try the wizard with a simulated loan file.

ZipLayer is a zero-config, ultra-lightweight, open-source (MIT) JavaScript SDK and web component that makes it easy for end users to download and interact with zip files — without requiring the end user to have an unzipping utility.

Instead of forcing users to download one massive monolithic ZIP, ZipLayer launches a **wizard modal** that streams the archive into the browser, previews its contents ("X-Ray"), and lets users grab exactly what they need:

- ⬇️ **Selective download** — pick individual files
- 📁 **Direct-to-folder extraction** — unpack straight into an OS folder (Chromium desktop)
- 🔗 **Fallback download** — the entire zip as a plain download (legacy browsers)

URL sources are **streamed through a Web Worker straight into the browser's Origin Private File System (OPFS)** — flat RAM even on 1 GB+ archives, with download progress. Everything runs **100% client-side**. No backend, no API keys, no servers.

---

## Features

| | |
|---|---|
| ⚡ **Zero Setup** | No build step, no worker files to eject, no backend. Drop it in and it works. |
| 🔍 **X-Ray Preview** | Stream the archive and inspect the directory tree before downloading anything. |
| 🧵 **Worker + OPFS Streaming** | URL sources decompress in a Web Worker and write straight to the browser's OPFS — flat RAM on huge archives. |
| ⬇️ **Selective Download** | Let users tick the files they actually need instead of grabbing one giant zip. |
| 📁 **Direct-to-OS Streaming** | Extract straight into an OS folder via File System Access — the worker streams files directly to disk, no OPFS round-trip. |
| 🛡️ **Graceful Fallback** | Device-aware tiers: direct extraction → OPFS preview → plain download fallback. |
| 🔓 **Open Source** | MIT licensed. Fully transparent, privacy-first, free for personal and commercial use. |

---

## Quick Start (drop-in component)

```html
<!-- 1 line of code -->
<zip-layer-modal src="https://portal.com/api/export.zip"></zip-layer-modal>
```

```html
<script type="module">
  import "./src/zip-layer-modal.js";
  document.querySelector("zip-layer-modal").open();
</script>
```

That's it. The modal streams the archive, shows download progress, then presents the X-Ray contents with the three options.

---

## Headless API

Use the SDK directly without any UI:

```javascript
import { ZipLayer } from "./src/ziplayer.js";

// 1. Device capabilities (Tier 1 / 2 / 3)
const caps = ZipLayer.getDeviceCapabilities();
// { canPreview: boolean, canExtractLocal: boolean, mustFallback: boolean }

if (caps.mustFallback) {
  // Legacy: plain download
  window.location.href = "https://portal.com/api/export.zip";
} else {
  // 2. X-Ray: stream + inspect contents
  const archive = await ZipLayer.xray("https://portal.com/api/export.zip", {
    onProgress: (pct) => console.log(`Streaming: ${pct}%`), // optional
  });
  const tree = archive.getFileTree(); // [{ path, name, dir, size, compressedSize }]

  // 3. Selectively extract one file
  const file = await archive.extractFile(tree[0].path); // native File object

  // 4. Or extract everything to an OS folder (Tier 1 only)
  if (caps.canExtractLocal) {
    await archive.extractToLocalFolder({
      onProgress: (pct) => console.log(`Unpacking: ${pct}%`),
    });
  }

  // 5. GLBA-friendly cleanup when done (wipes OPFS session storage)
  archive.destroy();
}
```

`ZipLayer.xray()` accepts a URL string, `ArrayBuffer`, `TypedArray`, or a `File`/`Blob`. **URL strings stream** — the fetch pipe hands compressed chunks to a module Worker (`src/zip-worker.js`) that decompresses with fflate and writes each file straight into OPFS, one chunk in flight at a time (backpressured, flat RAM). On devices without OPFS or Workers, or for raw bytes/File/Blob input, it falls back to in-memory parsing automatically. `ZipLayer.canStream()` reports whether streaming is available on the current device.

---

## Hosting & Distribution

The site and library are fully static and root-relative, so they work from any host — including GitHub Pages and CDNs like jsDelivr — with no build step or configuration.

**GitHub Pages** — the home page is live at **https://spuds0588.github.io/ZipLayer/** (served from the repo root via `.nojekyll`).

**jsDelivr (GitHub)** — the ESM modules are dependency-free and import each other relatively, so they work straight off the CDN:

```html
<script type="module">
  import "https://cdn.jsdelivr.net/gh/Spuds0588/ZipLayer@main/src/zip-layer-modal.js";
  document.querySelector("zip-layer-modal").open();
</script>
```

---

## Live Demo

👉 **Open the home page → https://spuds0588.github.io/ZipLayer/** (or just open `index.html`) and click **⬇ Download Example Zip** to launch the wizard with a simulated mortgage loan file (`assets/JohnSmith-LoanFile.zip`) — W-2, pay stub, sales contract, and driver's license for a fictitious borrower. The example archive is committed as a static asset — swap it for your own zip any time.

---

## Device Tiers

| Tier | Browsers | Capabilities |
|---|---|---|
| **Tier 1** | Chromium desktop | Full OPFS + File System Access — direct-to-folder extraction |
| **Tier 2** | Modern Safari / Firefox / mobile | OPFS enabled — X-Ray preview + selective file download |
| **Tier 3** | Legacy | Graceful fallback to a plain `.zip` download |

`getDeviceCapabilities()` evaluates `navigator.storage.getDirectory` (OPFS), `Worker` support, and `window.showDirectoryPicker` (File System Access) to pick the right tier automatically. Phase 2 streaming (Worker + OPFS) requires a secure context — GitHub Pages, jsDelivr, and localhost all qualify; `xray()` degrades gracefully to in-memory parsing otherwise.

---

## Privacy

**We collect nothing at all — and we never will.** ZipLayer runs entirely in your browser: no servers, no accounts, no analytics, no cookies, no trackers. Your files never leave your machine. See [Privacy Policy](privacy.html).

---

## Sister Projects

- 💌 [**MailLayer**](https://github.com/Spuds0588/MailLayer) — native email sending from a Chrome extension
- ✉️ [**MailLayer Embedded**](https://github.com/Spuds0588/MailLayer-Embedded) — drop-in email script for the web

---

## 🤖 For AI Coding Agents

Building with ZipLayer using a vibe coder, Cursor, Copilot, Claude Code, or any other AI coding agent? This repo ships **[`AGENTS.md`](AGENTS.md)**, a knowledge file that teaches coding agents how to **use** ZipLayer: quick-start integration for the drop-in modal and headless SDK, the full API reference, browser-support tiers, and integration gotchas. Many agents read `AGENTS.md` automatically — point yours at it and it can wire ZipLayer into your app without guessing. **Point your agent at it and go.**

## Development

```bash
npm install        # installs fflate (the only dependency)
npm run dev        # start the local preview server (http://localhost:4173)
npm run build      # build static site into dist/
```

## Credits

ZipLayer's archive engine is **[fflate](https://github.com/101arrowz/fflate)** (MIT) by [Arjun Barrett](https://github.com/101arrowz) — a tiny, high-performance, dependency-free zip/gzip library that does all the heavy lifting. A vendored copy ships in [`lib/fflate.mjs`](lib/fflate.mjs), so ZipLayer stays 100% offline and dependency-free at runtime.

## License

[MIT](LICENSE) © 2026 ZipLayer.
