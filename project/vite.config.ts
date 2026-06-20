import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the sw.js we wrote manually in public/
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      manifest: {
        name: 'محور — منصة التجارة B2B',
        short_name: 'محور',
        description: 'منصة ذكية لإدارة المخزون والطلبات بين المحلات',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: false, // disable in dev to avoid confusion
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase':['@supabase/supabase-js'],
          'vendor-icons':   ['lucide-react'],
          'chunk-admin': [
            './src/pages/AdminDashboardPage',
            './src/pages/ShopsPage',
            './src/pages/CreateShopPage',
            './src/pages/UsersPage',
            './src/pages/PermissionsPage',
            './src/pages/GlobalInventoryPage',
            './src/pages/GlobalOrdersPage',
            './src/pages/OrganizationsPage',
          ],
          'chunk-orders': ['./src/pages/orders/OrdersPage'],
          'chunk-shop': [
            './src/pages/DashboardPage',
            './src/pages/SearchPage',
            './src/pages/InventoryPage',
            './src/pages/ReportsPage',
            './src/pages/AlertsPage',
            './src/pages/ShopSettingsPage',
          ],
          'chunk-public': [
            './src/pages/ShopPublicPage',
            './src/pages/VerifyInvoicePage',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 400,
  },
});
