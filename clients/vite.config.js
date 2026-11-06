import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': apiTarget,
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
    },
  },
});
