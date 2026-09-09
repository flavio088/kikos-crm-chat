import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: {
      "/crm": API_URL,
      "/webhooks": API_URL,
    },
  },
});
