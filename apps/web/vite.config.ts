import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { askApi } from "./server/ask";

export default defineConfig(({ mode }) => {
  // Empty prefix loads every variable, including AI keys. They reach only the
  // server-side ask API; the browser still sees only VITE_* variables.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react(), askApi(env)],
    server: { port: 5173 },
  };
});
