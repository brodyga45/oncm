import {network} from './sdk/local-network.mjs';
import {defineConfig} from 'vite';import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],define:{'import.meta.env.VITE_AGORA_PORT_OFFSET':JSON.stringify(process.env.AGORA_PORT_OFFSET??'0')},server:{port:network.webPort,strictPort:true,proxy:{'/api':network.apiUrl}},build:{outDir:'dist'}});
