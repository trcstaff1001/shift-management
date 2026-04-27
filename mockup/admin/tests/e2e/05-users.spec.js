// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 利用者管理 — 一覧 + 招待モーダル + 代理入力リンク
 */

test.describe('users.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('users.html');
  });

  test('利用者一覧が11名分表示される', async ({ page }) => {
    const rows = page.locator('#userTable tr');
    await expect(rows).toHaveCount(11);
  });

  test('招待モーダルが開閉する', async ({ page }) => {
    await expect(page.locator('#inviteModal')).not.toBeVisible();
    await page.locator('header.main-header button.btn:has-text("新規招待")').click();
    await expect(page.locator('#inviteModal')).toBeVisible();
    // キャンセルで閉じる
    await page.locator('#inviteModal button:has-text("キャンセル")').click();
    await expect(page.locator('#inviteModal')).not.toBeVisible();
  });

  test('招待送信ボタンで alert が出る', async ({ page }) => {
    await page.locator('header.main-header button.btn:has-text("新規招待")').click();
    page.once('dialog', dialog => {
      expect(dialog.message()).toContain('招待メール');
      dialog.dismiss();
    });
    await page.locator('#inviteModal button:has-text("招待を送信")').click();
  });

  test('ダミーID発行ボタンで @local が含まれる alert が出る', async ({ page }) => {
    await page.locator('header.main-header button.btn:has-text("新規招待")').click();
    page.once('dialog', dialog => {
      expect(dialog.message()).toContain('@local');
      dialog.dismiss();
    });
    await page.locator('#inviteModal button:has-text("ダミーID発行")').click();
  });

  test('行サマリに件数が表示', async ({ page }) => {
    await expect(page.locator('#rowSummary')).toContainText(/\d+/);
  });

  test('ステータスのピル表示が存在する', async ({ page }) => {
    // 各行は status と 5月希望 の2列にpillが出る
    //   - 利用中×10 + 提出済×8 = success 18
    //   - 停止×1 = muted 1
    //   - 未提出×2 = warn 2
    await expect(page.locator('#userTable .pill.success')).toHaveCount(18);
    await expect(page.locator('#userTable .pill.muted')).toHaveCount(1);
    await expect(page.locator('#userTable .pill.warn')).toHaveCount(2);
  });
});
