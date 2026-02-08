import { defineConfig } from 'vite';

const buildId = process.env.GITHUB_SHA || `local-${new Date().toISOString()}`;

export default defineConfig({
  base: '/virtualoffice/',
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId)
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
