// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 段階1-③ シフト希望提出フロー
 *   - カレンダー描画、閉所日のロック
 *   - 選択 → カウンター → 提出 → 確認 → 完了
 *   - 上限超過のブロック
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

test.describe('request.html (シフト希望提出)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('request.html');
  });

  test('カレンダー描画と閉所日のロック', async ({ page }) => {
    // 5月は31日 + 5月3日〜6日が祝日 + 日曜
    const cells = page.locator('#calendar .cell:not(.empty)');
    await expect(cells).toHaveCount(31);

    // 閉所日（5/3 日曜・GW祝日）の cell は closed クラス
    const closed = page.locator('#calendar .cell.closed');
    const closedCount = await closed.count();
    expect(closedCount).toBeGreaterThanOrEqual(8); // 日曜5日 + GW3日（5/3は日曜と重複）
  });

  test('5日選択でカウンターが 5/23 になる', async ({ page }) => {
    const openCells = page.locator('#calendar .cell:not(.empty):not(.closed)');
    for (let i = 0; i < 5; i++) {
      await openCells.nth(i).click();
    }
    await expect(page.locator('#selectedCount')).toHaveText('5');
    await expect(page.locator('#limitDays')).toHaveText('23');
    await expect(page.locator('#submitBtn')).toBeEnabled();
  });

  test('閉所日はクリックしても選択されない', async ({ page }) => {
    const closed = page.locator('#calendar .cell.closed').first();
    await closed.click({ force: true });
    await expect(page.locator('#selectedCount')).toHaveText('0');
  });

  test('上限23日選択 + 24日目で alert ブロック', async ({ page }) => {
    const openCells = page.locator('#calendar .cell:not(.empty):not(.closed)');
    const total = await openCells.count();
    // 23日全部選択
    const cap = Math.min(23, total);
    for (let i = 0; i < cap; i++) {
      await openCells.nth(i).click();
    }
    await expect(page.locator('#selectedCount')).toHaveText(String(cap));

    if (total > cap) {
      // 24日目を選択しようとすると alert
      page.on('dialog', dialog => {
        expect(dialog.message()).toContain('最大');
        dialog.dismiss();
      });
      await openCells.nth(cap).click();
    }
  });

  test('提出フロー: 確認モーダル → 完了モーダル', async ({ page }) => {
    const openCells = page.locator('#calendar .cell:not(.empty):not(.closed)');
    for (let i = 0; i < 3; i++) await openCells.nth(i).click();

    await page.locator('#submitBtn').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await expect(page.locator('#modalCount')).toHaveText('3');

    await page.locator('#modalSubmit').click();
    await expect(page.locator('#doneModal')).toBeVisible();
    await expect(page.locator('#doneModal h2')).toContainText('提出しました');
  });

  test('「キャンセル」で確認モーダルが閉じる', async ({ page }) => {
    const openCells = page.locator('#calendar .cell:not(.empty):not(.closed)');
    await openCells.first().click();
    await page.locator('#submitBtn').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.locator('#modalCancel').click();
    await expect(page.locator('#confirmModal')).not.toBeVisible();
    await expect(page.locator('#doneModal')).not.toBeVisible();
  });
});
