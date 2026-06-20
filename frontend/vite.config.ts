import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // lắng nghe trên LAN để iPhone / tunnel vào được
    allowedHosts: true, // cho phép domain tunnel (vd *.trycloudflare.com)
    // Vite proxy sang backend -> chỉ cần expose 1 cổng (HTTPS).
    proxy: {
      "/translate": { target: "ws://localhost:8787", ws: true },
      "/presence": { target: "ws://localhost:8787", ws: true },
      "/api": { target: "http://localhost:8787" },
      "/health": { target: "http://localhost:8787" },
    },
  },
});
