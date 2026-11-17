import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const target = env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001';

  return {
    envDir,
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target },
        '/socket.io': { target, ws: true },
      },
    },
    preview: { host: '127.0.0.1' },
    build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] },
  };
});
