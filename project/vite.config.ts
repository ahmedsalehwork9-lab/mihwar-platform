import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' وليس 'autoUpdate': ده نظام ERP فيه فواتير وسندات بتتكتب على الشاشة.
      // autoUpdate بيعمل reload تلقائي وممكن يضيّع شغل مش محفوظ؛ prompt بيسيب المستخدم يقرر.
      registerType: 'prompt',
      // التسجيل بيتم يدويًا من src/pwa/registerPwa.ts عبر virtual:pwa-register
      injectRegister: false,
      strategies: 'generateSW',
      manifestFilename: 'manifest.webmanifest',
      // مانيفست واحد فقط (المصدر الوحيد). بيتحقن تلقائيًا في index.html
      manifest: {
        id: '/',
        name: 'MIHWAR CLOUD ERP',
        short_name: 'MIHWAR',
        description: 'نظام تخطيط موارد المؤسسات السحابي: مبيعات، مشتريات، مخزون، محاسبة ونقاط بيع',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0B1F44',
        background_color: '#06122B',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // precache للملفات الثابتة فقط (JS/CSS/shell/صور/خطوط) — لا أي بيانات
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['landing/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/verify/, /\/[^/?]+\.[^/]+$/],
        cleanupOutdatedCaches: true,
        // في وضع prompt: لا skipWaiting تلقائي. التفعيل بعد ضغط المستخدم على «تحديث».
        skipWaiting: false,
        clientsClaim: true,
        // لا runtime caching إطلاقًا: أي طلب غير مُدرج في الـ precache (Supabase والـ API وغيرها)
        // مش بيمر على الـ service worker أصلًا ويروح للشبكة مباشرة — أسرع وبدون أي كاش بيانات.
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
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
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons':    ['lucide-react'],
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
