import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 30000, fullyParallel: false, retries: 0,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', headless: true },
  webServer: { command: 'bash scripts/prepare-web.sh && python3 -m http.server 5174 --bind 0.0.0.0 --directory .output/public', url: 'http://127.0.0.1:5174', reuseExistingServer: true, timeout: 30000 }
});
