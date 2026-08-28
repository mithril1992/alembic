import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages は https://<user>.github.io/alembic/ 配下に配置されるため、
// base をリポジトリ名に合わせる。絶対パス参照は本番でのみ 404 になる。
export default defineConfig({
  base: '/alembic/',
  plugins: [react()],
});
