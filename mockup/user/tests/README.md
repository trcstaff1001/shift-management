# 利用者画面 E2E テスト (Playwright)

利用者画面モックの自動検収。Playwright + Chromium で各動線をエンドツーエンドで検証する。

## 初回セットアップ（5分・1回のみ）

前提: Node.js 18+ がインストール済み。

```bash
cd work/mockup/user/tests
npm install
npx playwright install chromium
```

ダウンロードサイズは ~150MB（Chromium本体）。`node_modules/` は `.gitignore` 対象。

## 実行

```bash
# 全テスト（ヘッドレス）
npm test

# UIランナー（ブラウザでテスト結果を見ながらデバッグ）
npm run test:ui

# ブラウザを表示しながら実行（目視で動作確認したい時）
npm run test:headed

# 特定のテストファイルのみ
npm test -- 01-login

# レポートを開く
npm run report
```

サーバー（python3 -m http.server）は **Playwright が自動起動**するので、別途起動不要です。
既に 8080 で起動済みの場合は再利用されます。

## テスト構成

| ファイル | 検収対象 |
|---|---|
| [01-login.spec.js](e2e/01-login.spec.js) | モックモード表示、認証フロー、セッション保持、二重ログイン回避 |
| [02-request.spec.js](e2e/02-request.spec.js) | カレンダー描画、閉所日ロック、上限ブロック、提出フロー2段モーダル |
| [03-calendar.spec.js](e2e/03-calendar.spec.js) | shiftRequests.list の status 別装飾、サマリ件数 |
| [04-profile.spec.js](e2e/04-profile.spec.js) | プロフィール表示、ログアウト、`在宅(関東)` の表示変換 |
| [05-session.spec.js](e2e/05-session.spec.js) | 未ログイン時の保護リダイレクト（5画面分） |

## 段階1（モック）検収との対応

| 検収項目 | 対応テスト |
|---|---|
| ① ログイン画面表示 + モックモード表示 | 01-login |
| ② ログイン → home 遷移 + 名前表示 | 01-login |
| ③ シフト希望提出フロー（5日選択 → 提出 → 完了） | 02-request |
| ④ カレンダー（確定/希望の色分け、サマリ） | 03-calendar |
| ⑤ プロフィール → ログアウト | 04-profile |
| ⑥ 未ログインリダイレクト | 05-session |

## 失敗時のデバッグ

- 失敗時は `playwright-report/` にスクリーンショット・ビデオ・トレースが残る
- `npm run report` で HTML レポートをブラウザ表示
- `npm run test:debug` で Playwright Inspector を立ち上げてステップ実行

## CI への組み込み（将来）

`process.env.CI=true` で実行すると:
- `forbidOnly` 有効化（`.only` 残しでビルド失敗）
- リトライ1回
- ワーカー1（並列実行を抑える）
- サーバーは reuse しない（毎回新規起動）

## 段階2: 実 API モードでの検収

GAS Web App をデプロイ済みであれば、モック検収のあとに実APIに対する検収を行えます。
**注意**: 現在のスペックはモックレスポンス前提（10日確定 / 4日希望 / 1日不承認 など）なので、実APIモードで全部 pass はしません。実APIで通したい項目は手動 + curl で確認するか、実API用の別 spec を作る必要があります。

### 段階2-A: 手動 + curl での実API検収（推奨・10分）

#### 1. 前提

| 項目 | 状態 |
|---|---|
| `setupSheets` 実行済み | ✓ |
| `seedBusinessDays` で `BusinessDays` 投入済み | ✓ |
| `migrateUsers` or `seedUsersFromTemplate` で `Users` 1名以上 | ✓ |
| そのユーザーの `password_hash` が GAS の `hashPassword('test1234')` 等で設定済み | ✓ |
| `api.gs` をデプロイ済み（Web App URL 取得済み） | ✓ |

#### 2. config.js に GAS_ENDPOINT を記入

`work/config.js` の該当行:
```js
GAS_ENDPOINT: 'https://script.google.com/macros/s/AKfy.../exec',
```

#### 3. curl でエンドポイント疎通確認

```bash
ENDPOINT='https://script.google.com/macros/s/AKfy.../exec'

# 設定値取得
curl -L "$ENDPOINT?action=config.list"
# → {"ok":true,"data":{"capacity":20,"daily_rate":1.5,...}}

# 利用者一覧
curl -L "$ENDPOINT?action=users.list&status=利用中"
# → {"ok":true,"data":[{"user_id":1,"name":"...","email":"..."}]}

# ログイン（成功）
curl -L -X POST "$ENDPOINT" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"auth.login","payload":{"user_id":1,"password":"test1234"}}'
# → {"ok":true,"data":{"user":{...}}}

# ログイン（失敗）
curl -L -X POST "$ENDPOINT" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"auth.login","payload":{"user_id":1,"password":"wrong"}}'
# → {"ok":false,"error":"パスワードが違います","code":"AUTH_FAILED"}

# シフト希望提出
curl -L -X POST "$ENDPOINT" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"shiftRequests.create","payload":{"user_id":1,"dates":["2026-05-01","2026-05-02"]}}'
# → {"ok":true,"data":{"created":[...],"skipped":[...]}}

# 同じ日付を再送（重複スキップ確認）
# → skipped に該当日付が入る、created は []
```

#### 4. ブラウザで実APIフロー確認

```bash
cd work
python3 -m http.server 8080 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8080/mockup/user/login.html`:

| # | 操作 | DevTools Network 期待 | Sheets 期待 |
|---|---|---|---|
| 1 | 実ユーザーID + 正しいパスワードでログイン | POST `auth.login` 200 / `ok:true` | — |
| 2 | request 画面で 3日選択 → 提出 | POST `shiftRequests.create` 200 | `ShiftRequests` に3行追加 |
| 3 | calendar.html を開く | GET `shiftRequests.list?user_id=X&month=2026-05` 200 | カレンダーに「希望」(青)で3日表示 |
| 4 | profile.html を開く | GET `users.list?status=利用中` 200 | 名前・メール・カテゴリが Sheets と一致 |
| 5 | パスワード誤りでログイン | POST `auth.login` 200 / `ok:false` | エラー赤文字表示 |
| 6 | DevTools で localStorage を空にしてリロード | — | login.html へリダイレクト |

#### 5. クリーンアップ

検収で投入したテスト用 ShiftRequests を消す:
- スプレッドシートの `ShiftRequests` タブで該当行を手動削除
- または GAS で `clearShiftRequestsByMonth('2026-05')` 等のヘルパを後日実装

### 段階2-B: 実API用の自動テスト（任意・将来）

将来的に CI で実API検収を回したい場合:
- `tests/e2e-api/` を別途作成し、実API想定のレスポンスをアサート
- `process.env.SHIFT_GAS_ENDPOINT` で切替
- 専用テストデータ（決まったユーザー・日付）を Sheets に固定

→ 当面は段階2-A の手動 + curl で十分。
