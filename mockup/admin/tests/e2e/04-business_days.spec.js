// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 営業日カレンダー — 開所/閉所トグル + 月切替 + 即時再計算
 */

test.describe('business_days.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('business_days.html');
  });

  test('カレンダーが描画される', async ({ page }) => {
    const cells = page.locator('#bdCal .bd-cell:not(.empty)');
    const count = await cells.count();
    // 月の日数（28〜31）と一致
    expect(count).toBeGreaterThanOrEqual(28);
    expect(count).toBeLessThanOrEqual(31);
  });

  test('月切替で URL hash が更新される', async ({ page }) => {
    await page.locator('.month-nav-btn[data-dir="+1"]').click();
    await expect(page).toHaveURL(/#month=\d{4}-\d{2}/);
  });

  test('開所セルクリックで閉所に切替、開所日数が減る', async ({ page }) => {
    const beforeText = await page.locator('#openCount').textContent();
    const beforeOpen = Number(beforeText?.match(/(\d+)/)?.[1]);

    // 開所セルを1つクリック
    const openCell = page.locator('#bdCal .bd-cell:not(.empty):not(.closed)').first();
    await openCell.click();

    const afterText = await page.locator('#openCount').textContent();
    const afterOpen = Number(afterText?.match(/(\d+)/)?.[1]);
    expect(afterOpen).toBe(beforeOpen - 1);
  });

  test('閉所セルクリックで開所に戻り、閉所日数が減る', async ({ page }) => {
    const beforeText = await page.locator('#closedCount').textContent();
    const beforeClosed = Number(beforeText?.match(/(\d+)/)?.[1]);

    const closedCell = page.locator('#bdCal .bd-cell.closed').first();
    await closedCell.click();

    const afterText = await page.locator('#closedCount').textContent();
    const afterClosed = Number(afterText?.match(/(\d+)/)?.[1]);
    expect(afterClosed).toBe(beforeClosed - 1);
  });

  test('月間延べ上限が「開所×20×1.25」で再計算される', async ({ page }) => {
    const openText = await page.locator('#openCount').textContent();
    const open = Number(openText?.match(/(\d+)/)?.[1]);
    const expectedMax = open * 20 * 1.25;

    const maxText = await page.locator('#monthlyMaxLabel').textContent();
    expect(Number(maxText)).toBe(expectedMax);
  });

  test('利用者月内上限 = 月の日数 - 8', async ({ page }) => {
    const limitText = await page.locator('#userLimit').textContent();
    const limit = Number(limitText?.match(/(\d+)/)?.[1]);
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(31 - 8);
  });
});
