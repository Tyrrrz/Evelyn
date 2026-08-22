import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const siteUrl = process.env.SITE_URL || "http://localhost:3000";
const base = new URL(siteUrl).pathname.replace(/\/?$/, "/");

export default defineConfig({
  base,

  plugins: [react(), tailwindcss()],

  build: {
    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: "index.html",
        notFound: "404.html",
      },
    },
  },

  server: {
    port: 3000,
  },

  define: {
    "import.meta.env.SITE_URL": JSON.stringify(siteUrl),
    "import.meta.env.BUILD_ID": JSON.stringify(process.env.BUILD_ID || ""),
    "import.meta.env.GOATCOUNTER_URL": JSON.stringify(process.env.GOATCOUNTER_URL || ""),
  },
});
