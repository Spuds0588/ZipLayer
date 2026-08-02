// <zip-layer-modal> — drop-in wizard modal (PRD Phase 4).
// Low-code usage:
//   <zip-layer-modal src="assets/file.zip" title="Loan File"></zip-layer-modal>
//   document.querySelector("zip-layer-modal").open()
//
// Flow: Streaming… (download progress) → X-Ray contents
// Options: 1) download selected files  2) download files to folder (Tier 1)
//          3) download the whole zip (Tier 3)
// Plus inline preview (eye) for PDFs, images, media, and text.
import { ZipLayer } from "./ziplayer.js";

const STYLE = `
:host { --zl-bg:#0d1117; --zl-panel:#161b22; --zl-border:#30363d; --zl-text:#e6edf3;
  --zl-muted:#8b949e; --zl-accent:#ff4fa3; --zl-accent-2:#ffb3d1; --zl-blue:#ff4fa3;
  --zl-blue-hi:#ff7ab5; --zl-green:#3fb950; --zl-red:#f85149; --zl-radius:14px; }
* { box-sizing: border-box; }
.overlay { position:fixed; inset:0; z-index:9999; display:none; align-items:center;
  justify-content:center; background:rgba(3,7,14,.72); backdrop-filter:blur(3px); padding:12px; }
.overlay.open { display:flex; }
.modal { width:min(700px, 100%); max-height:calc(100dvh - 24px);
  display:flex; flex-direction:column; background:var(--zl-panel); color:var(--zl-text);
  border:1px solid var(--zl-border); border-radius:var(--zl-radius);
  box-shadow:0 30px 80px rgba(0,0,0,.55); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
header { display:flex; align-items:center; gap:10px; padding:12px 14px;
  border-bottom:1px solid var(--zl-border); }
.logo { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px;
  border-radius:8px; background:linear-gradient(135deg,var(--zl-accent),#c81e6f); color:#fff;
  font-weight:800; font-size:14px; flex:none; }
header .title { flex:1 1 auto; font-weight:700; font-size:15px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
header .step { flex:none; color:var(--zl-muted); font-size:12px; }
header .close { border:none; background:none; color:var(--zl-muted); font-size:20px; cursor:pointer;
  line-height:1; padding:2px 6px; border-radius:6px; flex:none; }
header .close:hover { color:var(--zl-text); background:var(--zl-border); }
main { padding:14px; overflow:auto; display:flex; flex-direction:column; min-height:0; }
[hidden] { display:none !important; }
/* streaming / extracting states */
.state { text-align:center; padding:26px 8px; }
.spinner { width:34px; height:34px; margin:0 auto 14px; border-radius:50%;
  border:3px solid var(--zl-border); border-top-color:var(--zl-accent); animation:spin .9s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.state h3 { margin:0 0 6px; font-size:15px; }
.state p { margin:0 0 14px; color:var(--zl-muted); font-size:12.5px; }
.bar { height:8px; border-radius:999px; background:var(--zl-border); overflow:hidden; margin:0 auto 8px; max-width:340px; }
.bar i { display:block; height:100%; width:0%; background:linear-gradient(90deg,var(--zl-accent),var(--zl-accent-2)); transition:width .15s ease; }
.pct { color:var(--zl-muted); font-size:12px; }
/* contents state */
.tree { list-style:none; margin:0 0 14px; padding:0; border:1px solid var(--zl-border); border-radius:10px;
  overflow:auto; max-height:min(44vh, 340px); }
.tree li { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--zl-border); }
.tree li:last-child { border-bottom:none; }
.tree li .ic { flex:none; }
.tree li .nm { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; word-break:break-word; }
.tree .dir .nm { color:#79c0ff; }
.tree .sz { flex:none; color:var(--zl-muted); font-size:12px; }
.tree input[type=checkbox] { flex:none; accent-color:var(--zl-accent); cursor:pointer; }
.icon-btn { flex:none; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;
  border:none; background:transparent; color:var(--zl-muted); cursor:pointer; border-radius:6px; padding:0; }
.icon-btn:hover { color:var(--zl-text); background:var(--zl-border); }
.icon-btn svg { width:15px; height:15px; }
.actions { display:flex; flex-direction:column; gap:8px; }
.actions .row1 { display:flex; gap:8px; flex-wrap:wrap; }
.actions .row1 .btn { flex:1 1 auto; }
.btn { font:inherit; font-size:13px; padding:9px 14px; border-radius:9px; cursor:pointer;
  border:1px solid var(--zl-border); background:var(--zl-border); color:var(--zl-text); }
.btn:hover { filter:brightness(1.15); }
.btn.primary { background:var(--zl-blue); border-color:var(--zl-blue); font-weight:600; }
.btn.primary:disabled { opacity:.45; cursor:not-allowed; }
.btn.green { background:var(--zl-green); border-color:var(--zl-green); color:#04230f; font-weight:600; }
.btn.green:hover { filter:none; background:#46c85c; }
.btn.ghost { background:transparent; }
/* preview state */
.preview-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
.preview-head .pv-name { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; font-weight:600; font-size:13px; }
.preview-head .pv-open { flex:none; color:var(--zl-accent); text-decoration:none; font-size:12.5px; }
.preview-head .pv-open:hover { text-decoration:underline; }
.viewer { flex:1; display:flex; align-items:center; justify-content:center; min-height:220px;
  background:#0a0a0f; border:1px solid var(--zl-border); border-radius:10px; overflow:auto; }
.viewer img { max-width:100%; max-height:55vh; object-fit:contain; border-radius:6px; }
.viewer iframe, .viewer object { width:100%; height:55vh; border:none; background:#fff; border-radius:6px; }
.viewer video { max-width:100%; max-height:55vh; }
.viewer audio { width:100%; margin:0 12px; }
.viewer pre { margin:0; padding:12px; white-space:pre-wrap; word-break:break-word; font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--zl-text); }
.viewer .pv-none { color:var(--zl-muted); text-align:center; padding:20px; }
footer { display:flex; gap:6px; flex-wrap:wrap; align-items:center; padding:10px 14px;
  border-top:1px solid var(--zl-border); color:var(--zl-muted); font-size:11.5px; }
footer .powered { margin-left:auto; display:inline-flex; align-items:center; gap:4px;
  color:var(--zl-muted); text-decoration:none; }
footer .powered:hover { color:var(--zl-accent); }
@media (max-width: 560px) {
  .overlay { padding:8px; }
  .modal { max-height:calc(100dvh - 16px); }
  header { padding:10px 12px; }
  header .step { display:none; }
  header .close { padding:6px 10px; } /* touch target */
  main { padding:10px; }
  .tree li { gap:6px; padding:7px 8px; }
  .tree .sz { font-size:11px; }
  .actions .row1 { flex-direction:column; }
  .actions .row1 .btn { width:100%; }
}
`;

const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const ICON_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function fmt(bytes) {
  return bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
}

const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const VIDEO_EXT = ["mp4", "webm", "ogg", "mov", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "m4a", "flac", "aac", "opus"];
const TEXT_EXT = ["txt", "md", "json", "csv", "html", "htm", "xml", "log", "js", "css", "mjs", "yml", "yaml"];

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export class ZipLayerModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._archive = null;
    this._bytes = null;
    this._sel = new Set();
    this._pvUrl = null;
    this._listeners = new Map();
  }

  static get observedAttributes() { return ["src", "title"]; }
  get src() { return this.getAttribute("src") || ""; }
  get title() { return this.getAttribute("title") || this.src.split("/").pop() || "archive.zip"; }

  connectedCallback() {
    this._render();
    this._qs(".close").addEventListener("click", () => this.close());
    this._qs(".overlay").addEventListener("click", (e) => {
      if (e.target === this._qs(".overlay")) this.close();
    });
    document.addEventListener("keydown", this._onKey = (e) => { if (e.key === "Escape") this.close(); });
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._onKey);
    this._listeners.forEach((fn, el) => el.removeEventListener("click", fn));
    this._listeners.clear();
    this._revokePv();
    if (this._archive) this._archive.destroy();
  }

  _qs(sel) { return this.shadowRoot.querySelector(sel); }
  _qsa(sel) { return [...this.shadowRoot.querySelectorAll(sel)]; }
  _on(el, fn) { el.addEventListener("click", fn); this._listeners.set(el, fn); }
  _revokePv() { if (this._pvUrl) { URL.revokeObjectURL(this._pvUrl); this._pvUrl = null; } }

  _render() {
    this.shadowRoot.innerHTML = `
<style>${STYLE}</style>
<div class="overlay">
  <div class="modal" role="dialog" aria-modal="true">
    <header>
      <span class="logo">Z</span>
      <span class="title">${this.title}</span>
      <span class="step" id="step">Streaming…</span>
      <button class="close" aria-label="Close">✕</button>
    </header>
    <main>
      <div class="state" id="state-streaming">
        <div class="spinner"></div>
        <h3>Streaming archive</h3>
        <p>Downloading <strong>${this.title}</strong> into your browser…</p>
        <div class="bar"><i id="bar"></i></div>
        <div class="pct" id="pct">0%</div>
      </div>
      <div class="state" id="state-extracting">
        <div class="spinner"></div>
        <h3>Downloading to folder</h3>
        <p>Writing files to your chosen directory…</p>
        <div class="bar"><i id="bar2"></i></div>
        <div class="pct" id="pct2">0%</div>
      </div>
      <div id="state-contents" hidden>
        <ul class="tree" id="tree"></ul>
        <div class="actions">
          <div class="row1">
            <button class="btn primary" id="btn-selected" disabled>⬇ Download selected (0)</button>
            <button class="btn green" id="btn-folder">📁 Download files to folder…</button>
          </div>
          <button class="btn" id="btn-full">⬇ Download .zip</button>
        </div>
      </div>
      <div id="state-preview" hidden>
        <div class="preview-head">
          <button class="icon-btn" id="pv-back" aria-label="Back to contents" title="Back">${ICON_BACK}</button>
          <span class="pv-name" id="pv-name"></span>
          <a class="pv-open" id="pv-open" target="_blank" rel="noopener" title="Open in new tab">${ICON_OPEN}</a>
        </div>
        <div class="viewer" id="pv-viewer"></div>
      </div>
    </main>
    <footer>
      <span id="foot-status"></span>
      <a class="powered" href="https://spuds0588.github.io/ZipLayer/" target="_blank" rel="noopener">⚡ Powered by ZipLayer</a>
    </footer>
  </div>
</div>`;
    this._on(this._qs("#btn-selected"), () => this._downloadSelected());
    this._on(this._qs("#btn-folder"), () => this._extractFolder());
    this._on(this._qs("#btn-full"), () => this._downloadFull());
    this._on(this._qs("#pv-back"), () => { this._revokePv(); this._showContents(); });
  }

  open() {
    this._qs(".overlay").classList.add("open");
    this._qs("#step").textContent = "Streaming…";
    this._show("state-streaming");
    this._progress(0);
    if (!this._bytes) this._stream();
    else this._showContents();
  }

  close() {
    this._revokePv();
    this._qs(".overlay").classList.remove("open");
  }

  _show(id) {
    ["state-streaming", "state-extracting", "state-contents", "state-preview"].forEach((s) => {
      this._qs("#" + s).hidden = s !== id;
    });
  }

  _progress(pct, which = 1) {
    const bar = this._qs(which === 2 ? "#bar2" : "#bar");
    const pctEl = this._qs(which === 2 ? "#pct2" : "#pct");
    bar.style.width = pct + "%";
    pctEl.textContent = pct + "%";
  }

  async _stream() {
    try {
      const res = await fetch(this.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) this._progress(Math.min(95, Math.round((got / total) * 100)));
      }
      this._progress(100);
      const bytes = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.length; }
      this._bytes = bytes;
      this._archive = await ZipLayer.xray(bytes);
      await new Promise((r) => setTimeout(r, 350)); // let 100% register
      this._showContents();
    } catch (err) {
      this._qs("#foot-status").textContent = "Streaming failed: " + err.message;
      this._qs("#step").textContent = "Error";
      this._show("state-contents");
    }
  }

  _showContents() {
    this._qs("#step").textContent = "Contents";
    this._show("state-contents");
    const caps = ZipLayer.getDeviceCapabilities();
    this._qs("#btn-folder").hidden = !caps.canExtractLocal;
    const tree = this._archive.getFileTree();
    const ul = this._qs("#tree");
    ul.innerHTML = "";
    for (const e of tree) {
      const li = document.createElement("li");
      li.className = e.dir ? "dir" : "";
      const ic = document.createElement("span");
      ic.className = "ic";
      ic.textContent = e.dir ? "📁" : "📄";
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = e.path;
      const sz = document.createElement("span");
      sz.className = "sz";
      sz.textContent = e.dir ? "—" : fmt(e.size);
      li.appendChild(ic);
      li.appendChild(nm);
      li.appendChild(sz);
      if (!e.dir) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.path = e.path;
        cb.addEventListener("change", () => {
          if (cb.checked) this._sel.add(e.path); else this._sel.delete(e.path);
          const b = this._qs("#btn-selected");
          b.disabled = this._sel.size === 0;
          b.textContent = `⬇ Download selected (${this._sel.size})`;
        });
        li.prepend(cb);
        const eye = document.createElement("button");
        eye.className = "icon-btn";
        eye.title = "Preview";
        eye.innerHTML = ICON_EYE;
        eye.addEventListener("click", () => this._preview(e.path));
        li.appendChild(eye);
        const dl = document.createElement("button");
        dl.className = "icon-btn";
        dl.title = "Download";
        dl.innerHTML = ICON_DL;
        dl.addEventListener("click", () => this._downloadOne(e.path));
        li.appendChild(dl);
      }
      ul.appendChild(li);
    }
    this._qs("#foot-status").textContent =
      tree.filter((e) => !e.dir).length + " files · " + fmt(this._bytes.length) + " downloaded";
  }

  async _preview(path) {
    try {
      const file = await this._archive.extractFile(path);
      const url = URL.createObjectURL(file);
      this._revokePv();
      this._pvUrl = url;
      this._qs("#pv-name").textContent = file.name;
      this._qs("#pv-open").href = url;
      const ext = extOf(file.name);
      const viewer = this._qs("#pv-viewer");
      if (ext === "pdf") {
        // <object> (not <iframe>) — Chromium's PDF viewer often renders blob: PDFs
        // blank inside iframes; <object type="application/pdf"> engages it reliably.
        viewer.innerHTML = `<object type="application/pdf" data="${url}" aria-label="${file.name}">` +
          `<p class="pv-none">PDF preview isn't supported in this browser.<br>` +
          `<a href="${url}" target="_blank" rel="noopener">Open the PDF</a> instead.</p></object>`;
      } else if (IMG_EXT.includes(ext)) {
        viewer.innerHTML = `<img src="${url}" alt="${file.name}">`;
      } else if (VIDEO_EXT.includes(ext)) {
        viewer.innerHTML = `<video src="${url}" controls playsinline></video>`;
      } else if (AUDIO_EXT.includes(ext)) {
        viewer.innerHTML = `<audio src="${url}" controls></audio>`;
      } else if (TEXT_EXT.includes(ext)) {
        viewer.innerHTML = `<pre></pre>`;
        viewer.firstElementChild.textContent = await file.text();
      } else {
        viewer.innerHTML = `<div class="pv-none">Preview not available for this file type.<br><button class="btn primary" id="pv-dl">⬇ Download</button></div>`;
        this._on(this._qs("#pv-dl"), () => this._downloadOne(path));
      }
      this._qs("#step").textContent = "Preview";
      this._show("state-preview");
    } catch (err) {
      this._qs("#foot-status").textContent = "preview: " + err.message;
    }
  }

  async _downloadOne(path) {
    try {
      const file = await this._archive.extractFile(path);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this._qs("#foot-status").textContent = `Downloaded ${file.name} (${fmt(file.size)})`;
    } catch (err) {
      this._qs("#foot-status").textContent = "extractFile: " + err.message;
    }
  }

  async _downloadSelected() {
    const paths = [...this._sel];
    for (const p of paths) await this._downloadOne(p);
  }

  _downloadFull() {
    if (!this._bytes) return;
    const blob = new Blob([this._bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = this.title;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this._qs("#foot-status").textContent = `Downloaded ${this.title}`;
  }

  async _extractFolder() {
    this._qs("#step").textContent = "Downloading to folder…";
    this._show("state-extracting");
    this._progress(0, 2);
    try {
      const res = await this._archive.extractToLocalFolder({
        onProgress: (pct) => this._progress(pct, 2),
      });
      this._showContents();
      this._qs("#foot-status").textContent = `Downloaded ${res.count} files to your folder ✓`;
    } catch (err) {
      if (err.name === "AbortError") return;
      this._showContents();
      this._qs("#foot-status").textContent = "extractToLocalFolder: " + err.message;
    }
  }
}

if (!customElements.get("zip-layer-modal")) customElements.define("zip-layer-modal", ZipLayerModal);
