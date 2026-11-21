# ADR 0001 — Sandboxed Iframe for VLibras 3D Avatar Rendering

- **Status:** Accepted
- **Context:** VoxLibras must overlay a 3D Libras avatar onto arbitrary web video pages such as YouTube while complying with Chromium Manifest V3 security constraints.

## Decision

Bundle the compiled VLibras Unity WebGL player (`vlibras-player-webjs`, LGPLv3) inside `extension/public/vlibras/`, host it in an MV3 `sandbox` page (`avatar.html`), embed that page inside an `<iframe>` within a Shadow DOM overlay (`OverlayWidget`), and control it exclusively through typed `window.postMessage` events (`AvatarBridge`).

## Alternatives Considered

1. **Injecting `https://vlibras.gov.br/app/vlibras-plugin.js` directly into host pages:**
   Rejected. YouTube enforces strict Content Security Policy with Trusted Types (`require-trusted-types-for 'script'`), blocking unapproved DOM/script injections. Furthermore, MV3 prohibits remotely hosted executable scripts, and the widget API targets user text selection rather than programmatic real-time streams.
2. **Running Unity WebGL in a standard extension page or content script:**
   Rejected. Unity WebGL builds require `'unsafe-eval'` / dynamic code generation, which MV3 blocks in `extension_pages` and allows only in `sandbox` pages without `allow-same-origin`.
3. **Side Panel only (`chrome.sidePanel`):**
   Kept as fallback (Plan B) if site CSPs had blocked extension iframes, because the product UX requires a draggable overlay directly on top of the video player.

## Consequences

- **Positive:** Complete CSS/DOM isolation from host pages, full programmatic control (`playNow`, `setSlider`, `setPauseState`, `stopAll`, completion callbacks), and zero remote executable code.
- **Negative:** Sandboxed pages run with an opaque (`null`) origin; therefore dictionary animation requests target `https://dicionario2.vlibras.gov.br/...` (verified to return `Access-Control-Allow-Origin: null`), and Unity assets add ~13.8 MB to the unpacked bundle.
- **Legal:** LGPLv3 license and attribution are preserved in `extension/public/vlibras/LICENSE` and `README.md`.
