import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages under any repo name.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // big libraries in their own long-cached files
        manualChunks: (id) => {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/d3") || id.includes("node_modules/internmap") || id.includes("node_modules/delaunator")) return "d3";
          if (id.includes("node_modules/gsap") || id.includes("node_modules/lenis")) return "motion";
        },
      },
    },
  },
});
