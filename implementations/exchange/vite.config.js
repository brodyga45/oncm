import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      buffer: fileURLToPath(
        new URL("./node_modules/buffer/index.js", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: 5172, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ["ethers"],
          siwe: ["siwe"],
          react: ["react", "react-dom/client"],
        },
      },
    },
  },
});
