import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { execSync } from "child_process"

const getVersion = () => {
  try {
    return execSync("git describe --tags --abbrev=0").toString().trim()
  } catch (e) {
    return "0.0.1-alpha"
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
})
