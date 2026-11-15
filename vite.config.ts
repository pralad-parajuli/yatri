import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl},
          {src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl},
          {src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl},
          {src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl},
        ],
      }),
    ],
    define: {
      CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
