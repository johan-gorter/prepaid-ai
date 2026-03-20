import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === "emulator" ? "dist-emulator" : "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("vuefire") ||
              id.includes("/vue/") ||
              id.includes("vue-router") ||
              id.includes("pinia") ||
              id.includes("@vue/")
            ) {
              return "vue";
            }
            if (id.includes("firebase") || id.includes("@firebase")) {
              // Let auth land in its own async chunk (dynamically imported)
              if (
                id.includes("@firebase/auth") ||
                id.includes("firebase/auth")
              ) {
                return "firebase-auth";
              }
              return "firebase";
            }
          }
        },
      },
    },
  },
  plugins: [
    vue(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Prepaid AI",
        short_name: "Prepaid AI",
        description: "AI-powered visualizations",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
}));
