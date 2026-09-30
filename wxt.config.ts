import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'CS Music Kit Explorer',
    description: 'Rate, compare, and track your CS2 music kits.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu0oLv8WZd78cTO7nA0BJgUjokO7QvhiCq6yjapZUZyRmWJ1q9W5S9J3Ix5E7cb5iu02hfa4XkzXWCKLi54Zl/SpaojkDSFrXF0U/CBqqKbMH66ovaZs9vndBOq83oun5oL2tehQf80RGF+KyzUpwayi0Ajd3h/9/gOdqantUSNsGep2zXpwMpA7jJtsImiv+F548WQ/B5UGrpjLRIy2nxKz9BXMJGv7BfwNbZDMzNxybCpYb+np99DmIPHpldL0L8LmM/2+q9EMzFEP5pcr4DtikE8iKuyhse+KA3LgxetsE0E8LD3+INmv57K/SkJGaqI5zpghYnQWCkdTrRxeLTwIDAQAB',
    permissions: ['storage', 'identity', 'alarms'],
    host_permissions: ['https://csgoskins.gg/*', 'https://www.googleapis.com/*'],
    oauth2: {
      client_id: '315594168157-5avif7p4aoh2253l0315ecbdfub9nkaj.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    },
    action: {
      default_title: 'Open CS Music Kit Explorer',
    },
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.mode === 'development') {
        manifest.name += ' (dev)';
        if (manifest.action?.default_title) {
          manifest.action.default_title += ' (dev)';
        }
      }
    },
  },
});
