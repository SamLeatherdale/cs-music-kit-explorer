import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CS Music Kit Explorer',
    description: 'Rate, compare, and track your CS2 music kits.',
    permissions: ['storage'],
    host_permissions: ['https://csgoskins.gg/*'],
    action: {
      default_title: 'Open CS Music Kit Explorer',
    },
  },
});
