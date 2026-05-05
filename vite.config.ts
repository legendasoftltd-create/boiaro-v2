import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const CHUNK_MAP: Record<string, string[]> = {
  react: ["react", "react-dom", "react-router-dom"],
  ui: [
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "@radix-ui/react-popover",
    "@radix-ui/react-select",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-accordion",
  ],
  charts: ["recharts"],
  sentry: ["@sentry/react"],
  query: ["@tanstack/react-query"],
  epub: ["epubjs"],
  pdf: ["pdfjs-dist"],
};

function manualChunks(id: string): string | undefined {
  for (const [chunk, modules] of Object.entries(CHUNK_MAP)) {
    if (modules.some((m) => id.includes(`/node_modules/${m}/`))) {
      return chunk;
    }
  }
}

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["boiaro.com", "www.boiaro.com", "staging.boiaro.com"],
    hmr: {
      overlay: false,
    },
    proxy: {
      '/trpc': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "::",
    port: 8080,
    allowedHosts: ["boiaro.com", "www.boiaro.com", "staging.boiaro.com"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
