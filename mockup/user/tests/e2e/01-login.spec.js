// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 段階1-① ログイン画面の表示と認証フロー
 */

test.describe('login.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('login.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('モックモード表示・必須要素の存在', async ({ page }) => {
    await expect(page).toHaveTitle(/ログイン/);
    await expect(page.locator('h1')).toContainText('シフト管理');

    // モックモードバナー
    await expect(page.locator('#modeNotice')).toBeVisible();
    await expect(page.locator('#modeNotice')).toContainText('モックモード');

    // 入力欄とボタン
    await expect(page.locator('#userId')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();
  });

  test('空入力では HTML5 required で送信されない', async ({ page }) => {
    await page.locator('#loginBtn').click();
    // 送信されなければ URL は login.html のまま
    await expect(page).toHaveURL(/login\.html/);
  });

  test('任意ID + パスワードでログイン → home.html に遷移', async ({ page }) => {
    await page.locator('#userId').fill('10001');
    await page.locator('#password').fill('test');
    await page.locator('#loginBtn').click();

    await page.waitForURL(/home\.html/);
    await expect(page.locator('#userName')).toHaveText('田中 太郎');
  });

  test('ログイン後セッションが保持される（home に直アクセスでもリダイレクトされない）', async ({ page }) => {
    await page.locator('#userId').fill('10001');
    await page.locator('#password').fill('test');
    await page.locator('#loginBtn').click();
    await page.waitForURL(/home\.html/);

    // 直接 calendar.html にアクセスしてもセッション維持
    await page.goto('calendar.html');
    await expect(page).toHaveURL(/calendar\.html/);
  });

  test('既にログイン済みなら login.html にアクセスしても home に飛ぶ', async ({ page }) => {
    // 先にセッションを仕込む
    await page.evaluate(() => {
      localStorage.setItem('shift_user_session', JSON.stringify({
        user_id: 10001, name: '田中 太郎', category: '通所',
      }));
    });
    await page.goto('login.html');
    await page.waitForURL(/home\.html/);
  });
});
