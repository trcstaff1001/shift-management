# GAS スクリプト

シフト管理システムのGoogle Apps Script群。

| ファイル | 用途 | 実行タイミング |
|---|---|---|
| [setup_sheets.gs](setup_sheets.gs) | 8タブの初期化（ヘッダー・書式・初期値投入） | 初回1回 + スキーマ変更時 |
| [lib.gs](lib.gs) | 共通ヘルパー（read/write/ID採番/Lock/JST/SHA-256/JSON） | API実装の土台 |
| [rules.gs](rules.gs) | 規定計算3関数（§7、書き込み前検証） | API実装の土台 |
| [api.gs](api.gs) | doGet/doPost ディスパッチャ + 参考ハンドラ | Webアプリとして公開 |
| [seed_business_days.gs](seed_business_days.gs) | 1年分の `BusinessDays` 一括投入（土日自動 + 祝日リスト + 事業所独自上書き） | 年初1回 / 祝日訂正時 |
| [migrate_excel_users.gs](migrate_excel_users.gs) | 既存Excel月別シート（Googleスプレッドシート変換済み）→ `Users` マスタ移行 | 初回1回 |
| [seed_users_paste.gs](seed_users_paste.gs) | Excelが手元にない場合の `Users` テンプレ＋手動貼付型シーダー | 初回1回（migrate_excel_users.gs の代替） |
| [seed_boundary_data.gs](seed_boundary_data.gs) | 規定 §7 の各境界（OK/NG）に意図的に張り付く `ShiftConfirmed` を生成し、実データ集計時の判定を検証 | 検証時のみ |

---

## setup_sheets.gs 実行手順

### 前提
- Googleアカウントにログイン済み
- 編集権限のある新規スプレッドシートを1枚用意できる状態

### 手順（5分想定）

1. **新規スプレッドシート作成**
   - [Google ドライブ](https://drive.google.com) → 新規 → Googleスプレッドシート
   - 名前を `シフト管理システム_dev` に変更（本番は別途作成推奨）

2. **Apps Scriptエディタを開く**
   - メニュー: 拡張機能 → Apps Script
   - 別タブでエディタが開く

3. **スクリプトを貼付**
   - 既存の `Code.gs` を全選択削除
   - [setup_sheets.gs](setup_sheets.gs) の中身を全てコピーして貼付
   - 💾 保存（Cmd+S）

4. **実行**
   - 上部の関数選択ドロップダウンで `setupSheets` を選択
   - ▶ 実行ボタン

5. **権限承認**（初回のみ）
   - 「権限を確認」→ 自分のGoogleアカウントを選択
   - 「Advanced」→「Go to (プロジェクト名) (unsafe)」→「Allow」
   - 要求権限はスプレッドシートの読み書きのみ（外部送信なし）

6. **完了確認**
   - エディタの実行ログにスプレッドシートIDが出力される
   - スプレッドシートタブに戻ると8タブが揃っている

7. **スプレッドシートIDを控える**
   - URLから抽出: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
   - `work/config.example.js` を `work/config.js` にコピーして `SPREADSHEET_ID` に記入
   - `.gitignore` に `work/config.js` を追加（未追加なら）

---

## 検証チェックリスト

実行後、以下を目視確認：

- [ ] タブが左から `Users / Admins / BusinessDays / ShiftRequests / ShiftConfirmed / Attendances / Notifications / _Config` の順に並んでいる
- [ ] 各タブの1行目のヘッダーが [docs/sheets_schema.md](../../docs/sheets_schema.md) と一致
- [ ] 1行目が固定（スクロールしてもヘッダーが残る）＋太字＋薄グレー背景
- [ ] `_Config` に5行の初期値（capacity / daily_rate / monthly_rate / monthly_off_days / submission_deadline_days_before）
- [ ] 適当なセルに `2026-04-27` と入力 → リロード後も `2026/4/27` 等に化けない（プレーンテキスト書式の確認）
- [ ] デフォルトの「シート1」が削除されている
- [ ] スプレッドシートIDを `work/config.js` に控えた

---

---

## API デプロイ手順（lib.gs / rules.gs / api.gs）

### ファイル追加

GASエディタ左ペインの「+」→「スクリプト」で以下3ファイルを追加し、それぞれの内容を貼付：

1. `lib.gs` ← [lib.gs](lib.gs)
2. `rules.gs` ← [rules.gs](rules.gs)
3. `api.gs` ← [api.gs](api.gs)

保存（Cmd+S）。

### 疎通テスト（デプロイ前）

1. 関数選択で `smokeTest` を選び ▶実行
2. 実行ログに `_Config` 値・空のUsers・パスワードhash/verify・JST時刻が出力されればOK
3. 任意で `seedTestUser` を実行して `Users` タブに1行追加 → 後で `auth.login` の動作確認に使う

### Webアプリとしてデプロイ

1. 右上「デプロイ」→「新しいデプロイ」
2. 種類: **ウェブアプリ**
3. 説明: `shift-system v0.1` 等
4. 実行ユーザー: **自分**（管理者アカウント）
5. アクセスできるユーザー: **全員**（または「Googleアカウントを持つ全員」）
   - 「全員」にすると認証なしでURL叩ける → 合言葉認証で守る前提
   - セキュリティ強化が必要な段階で「Googleアカウントを持つ全員」に切り替え
6. デプロイ → 表示されたURLをコピー
7. `work/config.js` の `GAS_ENDPOINT` に貼付

### 動作確認（任意）

```
# config取得
curl 'https://script.google.com/macros/s/__ID__/exec?action=config.list'

# users一覧
curl 'https://script.google.com/macros/s/__ID__/exec?action=users.list'

# ログイン（seedTestUserで作ったユーザー）
curl -L -X POST 'https://script.google.com/macros/s/__ID__/exec' \
  -H 'Content-Type: application/json' \
  -d '{"action":"auth.login","payload":{"user_id":1,"password":"test1234"}}'
```

### コード変更時の再デプロイ

「デプロイ」→「デプロイを管理」→ 既存デプロイの ✏️ → バージョン: 新バージョン → デプロイ。
**URLは変わらないので config.js の更新不要。**

---

## エンドポイント一覧

| action | 種別 | パラメータ | 戻り |
|---|---|---|---|
| `config.list` | GET | - | _Config 全値 |
| `users.list` | GET | `status?` | Users（password_hash除外） |
| `shiftRequests.list` | GET | `user_id?`, `month?` | ShiftRequests絞り込み |
| `auth.login` | POST | `user_id`, `password` | user情報（成功時） |
| `shiftRequests.create` | POST | `user_id`, `dates[]` | created/skipped |
| `shiftConfirmed.create` | POST | `records[]` | created/skipped、規定NG時はエラー |
| `attendances.create` | POST | `records[{user_id,date,status,recorded_by,note?}]` | created/updated |
| `users.invite` | POST | `name`, `email`, `category` | user/temp_password/mail_sent |

### `shiftConfirmed.create` の挙動詳細

- 全件 atomic: 1件でも規定NGなら全件reject（書き込みされない）
- 重複 (user_id, date) は skip 扱い、エラーにしない
- 検証順: **影響日の1日制約** → **user×month の上限** → **影響月の月間制約（単月125%）**
- 上限ちょうどはOK、超過でNG（境界仕様: 1日30名NG / 利用者上限超でNG / 月間 > 125% でNG）

### 未実装（今後 必要になったら追加）

- `users.update` — カテゴリ・ステータス変更
- `users.changePassword` — 利用者自身のパスワード変更
- `notifications.list` — 通知一覧
- `notifications.markRead` — 既読化

---

## 規定計算3関数のテスト

GASエディタで `testRules` を実行 → ログに ✓/✗ の検証結果が出る:

```
=== checkDailyConstraint ===
✓ 29名(全員施設内) → {"ok":true,"level":"ok"} (期待: ...)
✓ 30名(全員施設内) → {"ok":false,"level":"ng"} (期待: ...)
...
```

**全行 ✓ なら規定計算は設計書 §7 通り**。✗ が出たら `rules.gs` の該当関数を修正して再実行。

---

## シードデータ投入（seed_business_days.gs / migrate_excel_users.gs）

`setupSheets` でタブを作った直後の空のスプレッドシートに、運用開始用のデータを一括投入する。

### 1. `seed_business_days.gs` — 営業日カレンダー1年分

冪等。複数回実行しても既存日付はスキップ。

1. Apps Script エディタ → `seed_business_days.gs` を貼付
2. `seedBusinessDays` を実行
3. Logger で「2026年の BusinessDays を XXX行 投入しました」を確認
4. `BusinessDays` タブに 365 行が入っているか目視確認

**祝日訂正時:** 冒頭の `HOLIDAYS_2026` を編集して `resetBusinessDays`（破壊的・全削除→再投入）を実行。

**土曜営業の切替:** 冒頭の `CLOSE_SATURDAY = true` にして `resetBusinessDays`。

**事業所独自の休業日:** `OVERRIDES` 配列に `{ date, is_open, note }` を追加。曜日デフォルトと祝日判定よりも**最優先**で適用される（例: `12/29-31 = 年末休業`、または `祝日だが特別開所` も可能）。

### 2. `migrate_excel_users.gs` — 既存Excel から Users マスタへ移行（推奨）

既存ExcelをGoogleスプレッドシートに変換できる場合のメインルート。冪等（既存 user_id はスキップ）。

1. 既存Excelを Google スプレッドシートに変換（ドライブで右クリック → アプリで開く → Googleスプレッドシート）
2. 変換後シートのスプレッドシートIDをURLから抽出
3. `migrate_excel_users.gs` を貼付し、冒頭の `SOURCE_SPREADSHEET_ID` と `SOURCE_SHEET_NAME` を設定
4. **まずドライラン**: `dryRunMigrateUsers` を実行 → Logger で投入予定とエラー件数を確認
5. 問題なければ `migrateUsers` を実行
6. `Users` タブに移行された行を目視確認

**移行後の Users 行:**
- `email` = `${user_id}@local`（管理者画面で個別に正式アドレスへ書換可能）
- `password_hash` = 空（招待メール送信時に発行）
- `status` = `利用中`

**カテゴリ正規化エラーが出た場合:** Logger に「未対応のカテゴリ表記: "XXX"」と出るので、`migrate_excel_users.gs` の `normalizeCategory` 内のマップに表記を追加して再実行。

### 2'. `seed_users_paste.gs` — テンプレ＋手動貼付（フォールバック）

Excelの変換が困難・移行元が手元にない場合に使用。`migrate_excel_users.gs` と同じカテゴリ正規化を再利用。

選択肢A — JSオブジェクトで直接定義:
1. `seed_users_paste.gs` の `USERS_TEMPLATE` 配列に `{ user_id, name, category }` を埋める
2. `seedUsersFromTemplate` を実行

選択肢B — Excelからタブ区切り貼付:
1. Excel/スプレッドシートで A〜C列（user_id, category, name）を選択コピー
2. `seed_users_paste.gs` の `RAW_TSV` バッククォート間に貼付
3. ヘッダー行を含む場合は `HAS_HEADER = true`
4. `seedUsersFromTemplate` を実行

両方併用も可能（USERS_TEMPLATE と RAW_TSV を両方埋めれば結合される）。

### 3. `seed_boundary_data.gs` — 規定境界の検証用 ShiftConfirmed（任意）

`testRules`（rules.gs）の単体テストでは拾えない**実データでの境界判定**を検証するための、規定スレスレの `ShiftConfirmed` を生成する。

前提:
- `Users.status='利用中'` が **30名以上**
- `BusinessDays` に対象月（デフォルト `2026-05`）の開所日が登録済み

シナリオ別実行関数:
| 関数 | 内容 | 期待結果 |
|---|---|---|
| `seedSafe` | 月間~110%、境界に触れない | 全規定OK |
| `seedBoundaryOK` | 月間~124% / 1ユーザー上限ちょうど(=23日) / 1日29名 | 全規定OK（境界張り付き） |
| `seedBoundaryNgMonthly` | 月間~126% | 月間制約NG |
| `seedBoundaryNgDaily` | 1日30名・全員施設内 | 1日制約NG |
| `clearShiftConfirmedForMonth` | 対象月のテストデータ全削除 | クリーンアップ |

各シナリオは実行時に**対象月の既存 ShiftConfirmed をクリアしてから生成**する（重複防止）。

**規定の最新仕様（2026-04-27）:**
- 月間制約: **単月** 125%超でNG（3ヶ月平均判定は廃止）
- 利用者月内上限: 上限値**ちょうどはOK**、超過でNG（`>` 判定）
- 1日制約: 30名到達でNG（29名以下はOK）

このシードは上記仕様前提でハード/ソフト境界を踏むよう設計されています。

---

## 再実行時の挙動（冪等性）

- 既存タブはそのまま、ヘッダーと書式のみ再適用
- データ行は触らない
- `_Config` の既存値も上書きしない（新規作成時のみ初期値投入）
- スキーマ変更時は `TAB_SCHEMA` を編集して再実行すればOK

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 「権限が必要です」で止まる | 一度ダイアログを閉じて再実行 → Advancedから許可 |
| 日付が `2026/4/27` に化ける | 該当列を選択 → 表示形式 → 数字 → プレーンテキスト |
| タブの並び順がズレる | `setupSheets` を再実行（並び順は毎回強制される） |
| `_Config` の初期値が入っていない | `_Config` タブを手動削除してから再実行 |
| 移行で `未対応のカテゴリ表記` エラー | `migrate_excel_users.gs` の `normalizeCategory` のマップに該当表記を追加 |
| 移行元スプレッドシートにアクセスできない | 共有設定で本Googleアカウントに編集または閲覧権限を付与 |
