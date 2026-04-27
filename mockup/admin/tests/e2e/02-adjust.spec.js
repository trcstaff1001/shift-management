// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * シフト調整（★コア）
 *   - 表が描画される（利用者×日付）
 *   - セルクリックで状態遷移
 *   - 月切替（hashベース）
 *   - 確定モーダルが出る
 */

test.describe('adjust.html (シフト調整)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('adjust.html');
  });

  test('利用者10名 × 日付31列 の表が描画される', async ({ page }) => {
    // tbody 行 = 利用者数
    const rows = page.locator('#tbody tr');
    await expect(rows).toHaveCount(10);

    // thead セル: user-col(1) + 日付31 + 合計1 = 33
    const ths = page.locator('#thead-row th');
    await expect(ths).toHaveCount(33);
  });

  test('月表示が正しく出る', async ({ page }) => {
    const monthLabel = await page.locator('#monthCurrent').textContent();
    expect(monthLabel).toMatch(/202\d年\d{1,2}月/);
  });

  test('月切替で URL hash が更新される', async ({ page }) => {
    const before = await page.locator('#monthCurrent').textContent();
    await page.locator('.month-nav-btn[data-dir="+1"]').click();
    await expect(page).toHaveURL(/#month=\d{4}-\d{2}/);
    const after = await page.locator('#monthCurrent').textContent();
    expect(after).not.toBe(before);
  });

  test('セルクリックで状態遷移（empty → requested など）', async ({ page }) => {
    // 閉所/empty以外の最初のセルを取得
    const cell = page.locator('#tbody .adjust-cell:not(.closed):not(.empty)').first();
    const cls0 = await cell.getAttribute('class');
    await cell.click();
    const cls1 = await cell.getAttribute('class');
    expect(cls1).not.toBe(cls0);
  });

  test('「この月のシフトを確定」で確認モーダルが開く', async ({ page }) => {
    await page.locator('#confirmOpenBtn').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await expect(page.locator('#confirmTitle')).toContainText('確定');
  });

  test('単月利用率の数値が表示される', async ({ page }) => {
    const text = await page.locator('#monthlyRateVal').textContent();
    // "—" 以外の数値が入る
    expect(text).toMatch(/\d/);
  });
});
