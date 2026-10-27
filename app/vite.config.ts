import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Dev runs the engine straight from app/engine; the installed app uses the bundled copy.
  define: {
    __ENGINE_MAIN__: JSON.stringify(path.resolve(__dirname, "engine", "main.mjs")),
  },
  clearScreen: false,
  // The engine and docs are not part of the window; editing them must not reload it mid-edit.
  server: { port: 5247, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/engine/**", "**/*.md"] } },
})
