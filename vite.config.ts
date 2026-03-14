import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true, // bind on 0.0.0.0 so LAN access works
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
});
