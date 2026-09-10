import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import {localEndpoints} from './sdk/local-endpoints.mjs';
const endpoints=localEndpoints(process.env.EXCHANGE_PORT_OFFSET||'0');
export default defineConfig({
  cacheDir: '.cache/vite',
  resolve: {
    alias: {
      buffer: fileURLToPath(
        new URL("./node_modules/buffer/index.js", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: endpoints.webPort, strictPort: true },
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
