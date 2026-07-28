// 앱인토스 번들 생성을 위한 미니앱 설정
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'lottobank',
  brand: {
    displayName: '로또뱅크',
    primaryColor: '#E91E4D',
    icon: 'https://lottobank.pages.dev/icon-512.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host 0.0.0.0',
      build: 'vite build',
    },
  },
  permissions: [
    { name: 'camera', access: 'access' },
    { name: 'photos', access: 'read' },
    { name: 'clipboard', access: 'read' },
  ],
  outdir: 'dist',
  webViewProps: {
    type: 'partner',
  },
});
