import { defineConfig } from "vite"
import reactRefresh from "@vitejs/plugin-react-refresh"

export default defineConfig({
  root: __dirname,
  plugins: [reactRefresh()]
})
