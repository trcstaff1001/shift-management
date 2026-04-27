# 管理者画面 E2E テスト (Playwright)

管理者画面モック (v0.2) の自動検収。利用者画面テストと独立構成。

## 初回セットアップ

```bash
cd work/mockup/admin/tests
npm install
npx playwright install chromium  # 利用者側で済んでいればスキップ可
```

## 実行

```bash
npm test                # 全テスト
npm run test:headed     # ブラウザ表示
npm run test:ui         # UIランナー
npm run report          # 失敗詳細レポート
```

サーバーは **port 8081** で自動起動（利用者側 8080 と分離）。並列実行可。

## テスト構成

| ファイル | 検収対象 |
|---|---|
| [01-dashboard.spec.js](e2e/01-dashboard.spec.js) | KPI / 3ヶ月推移 / 対応待ちテーブル |
| [02-adjust.spec.js](e2e/02-adjust.spec.js) | ★コア: 表描画 / セル状態遷移 / 月切替 / 確定モーダル |
| [03-attendance.spec.js](e2e/03-attendance.spec.js) | 出欠切替 / 日付ナビ / 「今日」ボタン |
| [04-business_days.spec.js](e2e/04-business_days.spec.js) | 開所/閉所トグル / 月切替 / 上限即時再計算 |
| [05-users.spec.js](e2e/05-users.spec.js) | 一覧 / 招待モーダル / ダミーID発行 / ステータスピル |
| [06-proxy_request.spec.js](e2e/06-proxy_request.spec.js) | v0.2 新規: 代理入力フロー |
| [07-notifications.spec.js](e2e/07-notifications.spec.js) | v0.2 新規: 通知配信履歴 + フィルタ |

## v0.2 で追加された規定判定の検証範囲

`02-adjust.spec.js` で以下を確認:
- セル状態遷移（empty → requested → approved → rejected → external）
- 単月利用率の表示
- 確定モーダルの起動

ハード/ソフトアラートの分岐ロジックは別途データ駆動でテスト追加予定（v0.3）。

## 利用者側テストとの関係

- 完全独立。`npm test` を両方走らせて全画面の回帰確認。
- ポート分離（利用者: 8080 / 管理者: 8081）で並列起動可能。
- `node_modules` も別、`.gitignore` 対象。
