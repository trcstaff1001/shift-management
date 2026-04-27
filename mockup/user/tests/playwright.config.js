// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright 設定
 *
 *   - 静的サーバーは python3 -m http.server で自動起動（work/ 階層から）
 *   - baseURL: http://localhost:8080/mockup/user/
 *   - localStorage の状態を毎テスト前にクリア（独立性確保）
 *   - 失敗時のみスクリーンショット + ビデオ
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:8080/mockup/user/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 414, height: 896 }, // iPhone 11 Pro Max 相当（モバイルファースト）
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 414, height: 896 } },
    },
  ],

  webServer: {
    command: 'python3 -m http.server 8080 --bind 127.0.0.1',
    cwd: '../../../',  // work/ から起動（../../config.js が解決可能になる）
    port: 8080,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
