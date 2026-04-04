import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5176,
    host: "100.96.113.106", // bind to Tailscale only — LAN devices cannot reach dev server
    headers: {
      "X-Frame-Options": "ALLOWALL",
    },
    proxy: {
      // CORS bypass for Outscraper S3 result downloads
      '/s3-proxy': {
        target: 'https://s3.us-east-005.backblazeb2.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3-proxy/, ''),
      },
    },
  },
})
