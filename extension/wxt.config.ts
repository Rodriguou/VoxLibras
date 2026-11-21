import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "VoxLibras",
    description: "Tradução automática de áudio de vídeos web para Libras em tempo real.",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    permissions: ["tabCapture", "offscreen", "storage", "activeTab", "scripting"],
    host_permissions: ["http://*/*", "https://*/*"],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      sandbox:
        "sandbox allow-scripts allow-forms; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:;",
    },
    web_accessible_resources: [
      {
        resources: ["avatar.html", "vlibras/*", "chunks/*", "assets/*"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
  },
});
