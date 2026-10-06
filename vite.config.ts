// 앱인토스 SDK를 웹 브라우저에서도 검증할 수 있도록 개발 도구를 연결합니다.
import { defineConfig } from 'vite';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

export default defineConfig({
  plugins: [aitDevtools.vite()],
});
