// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 段階1-⑥ セッション保護: 未ログイン時は login.html へ強制リダイレクト
 */

const protectedPages = ['home.html', 'request.html', 'calendar.html', 'profile.html', 'notifications.html'];

test.describe('未ログイン時の保護', () => {
  for (const file of protectedPages) {
    test(`${file} は未ログインだと login.html にリダイレクト`, async ({ page }) => {
      await page.goto('login.html');
      await page.evaluate(() => localStorage.clear());
      await page.goto(file);
      await page.waitForURL(/login\.html/);
    });
  }
});
