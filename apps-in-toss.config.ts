// 앱인토스 번들 생성을 위한 미니앱 설정
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'lottobank',

  brand: {
    primaryColor: '#E91E4D'
  },

  permissions: [
    { name: 'camera', access: 'access' },
    { name: 'photos', access: 'read' },
    { name: 'clipboard', access: 'read' },
  ],

  webBundleDir: 'dist',
  webView: {}
});
