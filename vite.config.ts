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
  sentry: ["@sentry/react"],
  query: ["@tanstack/react-query"],
  // `recharts`/`pdfjs-dist` are NOT given their own manual chunk (unlike the
  // groups above) — they're each only reachable from one lazy route (Admin
  // analytics pages, EbookReader). Forcing them into always-named top-level
  // chunks made Rollup's automatic cross-chunk deduplication hoist shared
  // runtime/helper code (used by every lazy() call in the app, not just these
  // libraries) into those chunks too — so every page ended up eagerly
  // fetching ~230KB of PDF/chart code it would never use. Leaving them
  // unassigned lets Rollup's default splitting scope them to an
  // automatically-shared chunk reachable only from the dynamic imports that
  // actually need them, so they load on-demand instead of on every page.
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
    modulePreload: {
      // Vite's default modulepreload injection treats `pdf`/`charts`/`epub` as
      // "commonly shared" chunks and preloads them on every page's entry HTML,
      // even though each is only reachable from one lazy route (EbookReader,
      // Admin analytics pages) — nothing eagerly imports pdfjs-dist/recharts/
      // epubjs. That added ~230KB of unnecessary preload weight to every page,
      // including the homepage. Excluding them here lets React.lazy's own
      // dynamic import fetch them on demand instead.
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/\/(pdf|charts|epub)-[^/]+\.js$/.test(dep)),
    },
  },
}));
