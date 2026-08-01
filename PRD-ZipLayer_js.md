
# ZipLayer.js: The Next-Generation Client-Side Archive SDK

### 1. Product Requirements Document (PRD)

#### 1.1 Objective & Overview
Build **ZipLayer.js**, a zero-config, ultra-lightweight JavaScript SDK for enterprise SaaS developers (Mortgage, Banking, Legal, Document Management). ZipLayer enables platforms to bypass the UX friction of generating and downloading massive monolithic ZIP files. It allows end-users to "X-Ray" archive contents, selectively download individual files, or extract full payloads directly into a local OS directory—all processed securely within the client's browser, saving massive server-side compute and bandwidth.

#### 1.2 Target Audience
*   **Direct Customer:** Front-end and Full-stack Developers, SaaS Engineering Teams.
*   **End-User:** Enterprise users dealing with high volumes of documents who require speed, transparency (security against blind malicious ZIPs), and native file system integration.

#### 1.3 Key Features & Guardrails
1.  **Frictionless Developer Experience (DX):** A true zero-config installation. No Webpack/Vite worker file ejecting. Web Workers and extraction engines are embedded as inline Blobs.
2.  **Graceful Degradation Architecture:** A `getDeviceCapabilities()` method that seamlessly falls back to standard `.zip` downloads on legacy browsers or unsupported mobile devices.
3.  **X-Ray Viewer (Selective Extraction):** Streams the ZIP securely into the browser's Origin Private File System (OPFS), allowing users to preview the directory structure and extract *only* what they need.
4.  **Direct-to-Folder Extraction:** Leverages the native HTML5 File System Access API (`window.showDirectoryPicker()`) to unzip files directly to the user's hard drive without requiring local unzipping utilities.
5.  **YAGNI Footprint:** Strictly leverages `fflate` for an ~8kb footprint. No legacy or proprietary formats (e.g., RAR) to prevent WASM bloat.
6.  **Headless-First Design:** Ships with a powerful headless API, with an optional drop-in Web Component for low-code setups.

---

### 2. Implementation Guide

#### 2.1 Core Architectural Decisions
*   **The Inline Worker Strategy:** Developers hate dealing with cross-origin Web Worker paths. We will compile `fflate` and our worker orchestration logic into a string during the build process, instantiated at runtime via `URL.createObjectURL(new Blob([workerString]))`. 
*   **Hardware Fallback Pipeline:**
    *   *Tier 1 (Chromium Desktop):* Full OPFS + File System Access API (Direct Extraction).
    *   *Tier 2 (Modern Safari / Firefox / Mobile):* OPFS enabled (X-Ray Preview & Selective File Download).
    *   *Tier 3 (Legacy):* Graceful degradation to standard server-side `a[download]` payload.
*   **Streaming over RAM:** The `fetch` reader must pipe chunks directly to `fflate` and then directly to OPFS or the OS File Handle to guarantee flat-line RAM usage, even on 1GB+ archives.

#### 2.2 Expected SDK API (Developer Interface)
```javascript
import { ZipLayer } from '@ziplayer/core';

// 1. Check Device Hardware/Browser Capabilities
const caps = ZipLayer.getDeviceCapabilities();
/* Returns: { canPreview: boolean, canExtractLocal: boolean, mustFallback: boolean } */

if (caps.mustFallback) {
  // Legacy support
  window.location.href = "https://portal.com/api/export.zip";
} else {
  // 2. X-Ray: Stream to OPFS and view contents
  const archive = await ZipLayer.xray('https://portal.com/api/export.zip');
  const tree = archive.getFileTree();
  
  // Selectively extract one file locally
  const singleFile = await archive.extractFile(tree[0].path);
  
  // OR 3. Direct-to-OS Extraction (if supported)
  if (caps.canExtractLocal) {
    document.getElementById('extract-btn').onclick = async () => {
      await ZipLayer.extractToLocalFolder('https://portal.com/api/export.zip', {
        onProgress: (percent) => console.log(`Unpacking: ${percent}%`)
      });
    };
  }
}
```

---

### 3. Developer Task List

#### Phase 1: Core Engine & Build Tooling
*   [ ] **Task 1.1:** Setup a lightweight build pipeline (Rollup or ESBuild) configured to output standard ESM and UMD formats for maximum compatibility.
*   [ ] **Task 1.2:** Write the script to convert `fflate.min.js` and our custom Web Worker orchestration script into an inline string/Blob generation function to eliminate external worker dependencies.
*   [ ] **Task 1.3:** Implement `ZipLayer.getDeviceCapabilities()` by evaluating the presence of `navigator.storage.getDirectory` (OPFS) and `window.showDirectoryPicker` (File System Access).

#### Phase 2: The OPFS "X-Ray" Module
*   [ ] **Task 2.1:** Build the `archive` object returned by `ZipLayer.xray()`. It must parse the ZIP directory structure without loading all files into RAM.
*   [ ] **Task 2.2:** Implement the streaming `fetch` pipe that delegates binary chunks to the inline Web Worker, decompresses them, and writes them to OPFS.
*   [ ] **Task 2.3:** Implement `archive.getFileTree()` returning a sanitized array of file/folder objects.
*   [ ] **Task 2.4:** Implement `archive.extractFile(path)` to pull a specific OPFS file handle and return a native HTML5 `File` object.
*   [ ] **Task 2.5:** Add an `archive.destroy()` method for aggressive, GLBA-compliant cleanup of the OPFS storage when the session ends.

#### Phase 3: Native OS File System Extraction
*   [ ] **Task 3.1:** Implement `ZipLayer.extractToLocalFolder(url)`.
*   [ ] **Task 3.2:** Request user OS permission via `window.showDirectoryPicker()`.
*   [ ] **Task 3.3:** Pass the resulting base `FileSystemDirectoryHandle` to the Web Worker.
*   [ ] **Task 3.4:** Write a recursive directory-creation algorithm that reads the `fflate` file path (e.g., `Borrower/Docs/W2.pdf`), creates nested `FileSystemDirectoryHandle`s on the user's hard drive, and streams the binary output directly into a `FileSystemWritableFileStream`.

#### Phase 4: Optional Web Component UI (Drop-In)
*   [ ] **Task 4.1:** Create a framework-agnostic `<zip-layer-modal>` Custom Web Component.
*   [ ] **Task 4.2:** Implement a clean, unstyled (or CSS-variable themed) file tree interface that visualizes `archive.getFileTree()`.
*   [ ] **Task 4.3:** Add UI states for "Streaming...", "Extracting to Folder...", and fallback links.

#### Phase 5: Hardening & Documentation
*   [ ] **Task 5.1:** Perform cross-browser testing: Verify Chromium works for Tier 1, Safari macOS/iOS falls back to Tier 2 (OPFS X-Ray), and unsupported browsers fallback cleanly to Tier 3.
*   [ ] **Task 5.2:** Test backpressure algorithms using a 500MB+ mock ZIP file to ensure the browser's memory heap remains completely flat during OPFS and Direct-to-OS writes.
*   [ ] **Task 5.3:** Write the `README.md` focusing heavily on the DX (Zero-Config), Security (No blind ZIP execution), and API reference.