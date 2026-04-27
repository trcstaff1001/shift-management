// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * ダッシュボード — KPI / 3ヶ月推移 / 本日出欠 / 対応待ち
 */

test.describe('dashboard.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('dashboard.html');
  });

  test('サイドバーに全メニューが揃い、ダッシュボードが active', async ({ page }) => {
    const nav = page.locator('.sidebar-nav');
    await expect(nav).toContainText('ダッシュボード');
    await expect(nav).toContainText('シフト調整');
    await expect(nav).toContainText('出欠管理');
    await expect(nav).toContainText('利用者管理');
    await expect(nav).toContainText('営業日カレンダー');
    await expect(nav).toContainText('通知配信履歴');
    await expect(page.locator('.sidebar-nav a.active')).toContainText('ダッシュボード');
  });

  test('KPI 4枚が描画される', async ({ page }) => {
    const stats = page.locator('.main-content > .stat-grid').first().locator('.stat');
    await expect(stats).toHaveCount(4);
  });

  test('3ヶ月推移カードに 3つのトレンドが見える', async ({ page }) => {
    const trends = page.locator('.trend .trend-month');
    await expect(trends).toHaveCount(3);
    await expect(trends.last()).toHaveClass(/current/);
  });

  test('対応待ちテーブルに3行ある', async ({ page }) => {
    const rows = page.locator('.card table tbody tr');
    await expect(rows).toHaveCount(3);
  });
});
