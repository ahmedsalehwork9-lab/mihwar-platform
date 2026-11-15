import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes least often, cached longest
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Icons — large library, isolated so it doesn't bust other chunks
          'vendor-icons': ['lucide-react'],
          // Admin pages — only loaded by admins
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
          // Orders subsystem — heaviest feature, isolated
          'chunk-orders': [
            './src/pages/orders/OrdersPage',
          ],
          // Shop user pages
          'chunk-shop': [
            './src/pages/DashboardPage',
            './src/pages/SearchPage',
            './src/pages/InventoryPage',
            './src/pages/ReportsPage',
            './src/pages/AlertsPage',
            './src/pages/ShopSettingsPage',
          ],
          // Public pages — no auth needed
          'chunk-public': [
            './src/pages/ShopPublicPage',
            './src/pages/VerifyInvoicePage',
          ],
        },
      },
    },
    // Raise the warning threshold slightly — we now split properly
    chunkSizeWarningLimit: 400,
  },
});
