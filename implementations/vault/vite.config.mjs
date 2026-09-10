import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {localEndpoints} from './sdk/local-endpoints.mjs';
const endpoints=localEndpoints(process.env.VAULT_PORT_OFFSET??0);
export default defineConfig({
  plugins: [svelte()],
  cacheDir: '.cache/vite',
  server: {
    host: '127.0.0.1',
    port:endpoints.webPort,
    strictPort: true,
    proxy:{'/api':endpoints.apiUrl},
  },
  build: { outDir: 'dist' },
});
