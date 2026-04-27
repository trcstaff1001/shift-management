// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 代理入力（v0.2 新規）
 *   - 利用者選択 → カレンダー表示
 *   - 日付選択カウント
 *   - 月切替
 */

test.describe('proxy_request.html (代理入力)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('proxy_request.html');
  });

  test('初期表示は「利用者を選択してください」', async ({ page }) => {
    await expect(page.locator('#proxyName')).toContainText('利用者を選択');
    await expect(page.locator('#targetCard')).not.toBeVisible();
  });

  test('利用者を選択するとカレンダーカードが表示される', async ({ page }) => {
    const select = page.locator('#userSelect');
    // 最初の利用者を選択
    const firstOption = await select.locator('option').nth(1).getAttribute('value');
    if (firstOption) {
      await select.selectOption(firstOption);
      await expect(page.locator('#targetCard')).toBeVisible();
      await expect(page.locator('#proxyCal')).toBeVisible();
    }
  });

  test('日付選択でカウンターが増える', async ({ page }) => {
    const select = page.locator('#userSelect');
    const firstOption = await select.locator('option').nth(1).getAttribute('value');
    if (firstOption) {
      await select.selectOption(firstOption);
      await expect(page.locator('#targetCard')).toBeVisible();
      const openCell = page.locator('#proxyCal .proxy-cell:not(.empty):not(.closed)').first();
      await openCell.click();
      await expect(page.locator('#selectedCount')).toHaveText('1');
    }
  });

  test('月切替で URL hash が更新される', async ({ page }) => {
    const select = page.locator('#userSelect');
    const firstOption = await select.locator('option').nth(1).getAttribute('value');
    if (firstOption) {
      await select.selectOption(firstOption);
      await page.locator('#monthNav .month-nav-btn[data-dir="+1"]').click();
      await expect(page).toHaveURL(/#month=\d{4}-\d{2}/);
    }
  });
});
