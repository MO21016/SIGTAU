import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Las llamadas a /api se reenvían a la API local (server/), tanto en `dev` como en `preview`.
const proxy = { "/api": `http://127.0.0.1:${process.env.API_PORT || 3001}` };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { proxy },
  preview: { proxy },
});
