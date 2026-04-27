// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 段階1-⑤ プロフィール表示とログアウト
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

test.describe('profile.html (プロフィール)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('profile.html');
  });

  test('セッション情報がプロフィール欄に表示', async ({ page }) => {
    await expect(page.locator('#pf-name')).toHaveText('田中 太郎');
    await expect(page.locator('#pf-id')).toContainText('10001');
    await expect(page.locator('#pf-cat')).toHaveText('通所');
  });

  test('利用上限が当月日数 - 8 で表示', async ({ page }) => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    await expect(page.locator('#pf-limit')).toContainText(String(last - 8));
  });

  test('ログアウトで login.html に戻り localStorage がクリアされる', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#logoutBtn').click();
    await page.waitForURL(/login\.html/);
    const session = await page.evaluate(() => localStorage.getItem('shift_user_session'));
    expect(session).toBeNull();
  });
});

test.describe('home.html (ホーム)', () => {
  test('カテゴリ "在宅(関東)" は利用者画面では「在宅」と表示される', async ({ page }) => {
    // セッションを直接仕込む
    await page.goto('login.html');
    await page.evaluate(() => {
      localStorage.setItem('shift_user_session', JSON.stringify({
        user_id: 99999, name: '関東 太郎', category: '在宅(関東)',
      }));
    });
    await page.goto('home.html');
    await expect(page.locator('#userMeta')).toContainText('カテゴリ: 在宅 /');
    await expect(page.locator('#userMeta')).not.toContainText('関東');
  });

  test('ログアウトリンクで login.html に戻る', async ({ page }) => {
    await login(page);
    await page.goto('home.html');
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#logoutLink').click();
    await page.waitForURL(/login\.html/);
  });
});
