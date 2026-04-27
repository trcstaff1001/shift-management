// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * 管理者画面の Playwright 設定
 *   - サーバー: python3 -m http.server 8081（利用者用と区別、競合回避）
 *   - baseURL: http://localhost:8081/mockup/admin/
 *   - ビューポートはデスクトップ（1280x900）
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:8081/mockup/admin/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'python3 -m http.server 8081 --bind 127.0.0.1',
    cwd: '../../../',
    port: 8081,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
