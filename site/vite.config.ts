import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://twadi.github.io/ai-engineering-arena/
export default defineConfig({
  base: "/ai-engineering-arena/",
  plugins: [react()],
});
