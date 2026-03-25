import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
//import svgLoader from 'vite-svg-loader';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  cacheDir: '/tmp/.vite',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {      
      '/api/v1/metrics': {
        target: process.env.VITE_SETTING_SERVICE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying:', req.method, req.url, '→', options.target + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Response:', proxyRes.statusCode, 'for', req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err.message, 'for', req.url);
          });
        },
      },
      '/api/containers': {
        target: process.env.VITE_CONTAINERS_TARGET || 'http://localhost:5000',
        secure: false,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
        timeout: 60000,
        proxyTimeout: 60000,
      },
      '/logs': {
        target: process.env.VITE_LOG_SERVICE_URL || 'http://localhost:47097',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying logs:', req.method, req.url, '→', options.target + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Logs response:', proxyRes.statusCode, 'for', req.url);
            // Add CORS headers to response
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
          });
          proxy.on('error', (err, req, res) => {
            console.error('Logs proxy error:', err.message, 'for', req.url);
          });
        },
      },
    },
  },
});

