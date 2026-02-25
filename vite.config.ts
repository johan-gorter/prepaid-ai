import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === "test" ? "dist-test" : "dist",
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
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.+/,
            handler: "CacheFirst",
            options: {
              cacheName: "firebase-storage-images",
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
}));
