import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://twadi.github.io/ai-eng-lab/
export default defineConfig({
  base: "/ai-eng-lab/",
  plugins: [react()],
});
