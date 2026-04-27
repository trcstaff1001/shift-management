// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 段階1-④ 確定シフト確認
 *   - モックの shiftRequests.list が status 別にセル装飾されること
 *   - サマリ件数の整合
 */

async function login(page) {
  await page.goto('login.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#userId').fill('10001');
  await page.locator('#password').fill('test');
  await page.locator('#loginBtn').click();
  await page.waitForURL(/home\.html/);
}

test.describe('calendar.html (確定シフト)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('calendar.html');
  });

  test('確定セル(緑) が10日付く', async ({ page }) => {
    // mock では status='承認' を 10日分返す
    await expect(page.locator('#calendar .cell.confirmed')).toHaveCount(10);
  });

  test('希望セル(青) が4日付く', async ({ page }) => {
    await expect(page.locator('#calendar .cell.requested')).toHaveCount(4);
  });

  test('不承認セルは取り消し線で表示', async ({ page }) => {
    await expect(page.locator('#calendar .cell.rejected')).toHaveCount(1);
  });

  test('サマリ表示が一致', async ({ page }) => {
    const summary = page.locator('#summary');
    await expect(summary).toContainText('確定');
    await expect(summary).toContainText('10日');
    await expect(summary).toContainText('4日');
  });

  test('凡例が表示される', async ({ page }) => {
    await expect(page.locator('.legend')).toContainText('通所');
    await expect(page.locator('.legend')).toContainText('希望（未確定）');
    await expect(page.locator('.legend')).toContainText('閉所日');
  });
});
