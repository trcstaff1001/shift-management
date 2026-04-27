# 利用者画面 モックアップ v0.1

設計書 §4.1 / §6.1 に基づく利用者向け画面のHTMLモック。
Pattern B（HTML + 共通 `style.css`）構成、Vanilla JS、モバイルファースト。

## 画面一覧

| ファイル | 画面 | 主機能 |
|---|---|---|
| login.html | ログイン | メール/ID + パスワード |
| home.html | ホーム | 主要アクションへの導線、未読通知バッジ |
| **request.html** | **シフト希望提出** | カレンダーで日付選択、上限カウンター、提出モーダル（インタラクティブ） |
| calendar.html | 確定シフト確認 | 月カレンダー（確定/希望/施設外を色分け） |
| notifications.html | お知らせ | 未読バッジ、空き枠通知から追加申し込み |
| profile.html | プロフィール | 登録情報・パスワード変更 |

## 確認方法

ローカルでファイルを直接開けばOK（外部依存なし）:

```
open login.html
```

または開発サーバーを使う場合:

```
cd work/mockup/user
python3 -m http.server 8080
# → http://localhost:8080/login.html
```

## デザイン方針（v0.3 — シンプル）

利用者層（B型作業所）の視認性を最優先。装飾を排し、白背景・青ベースのデフォルト寄りな構成。

- 基準フォントサイズ 16px、見出し最大 28px
- タップ領域 48px 以上
- フォント: 端末標準の日本語ゴシック（Hiragino Kaku Gothic ProN / Hiragino Sans / Noto Sans JP / Meiryo）
- 配色: 白背景 + 青系プライマリ + 承認=緑 / 警告=赤の最小限
- アイコン依存せずテキスト主体
- 余白広め、角丸控えめ

## モックの範囲

- ✅ 画面遷移はリンクで連結
- ✅ シフト希望提出のカレンダー操作（選択/解除、上限チェック）
- ✅ 提出フローのモーダル
- ✅ **GAS API 接続済み**（auth.login / shiftRequests.list / shiftRequests.create / users.list）
- ✅ localStorage セッション（user_id/name/category のみ保持）
- ✅ GAS_ENDPOINT 未設定時のモックフォールバック
- ❌ 月の前後切替は未実装（5月固定）
- ❌ notifications.list / shiftConfirmed.list 未実装（GAS側）→ 通知画面と確定シフト画面は暫定表示

## API 接続（v0.4 — 2026-04-27）

[api.js](api.js) が共通ラッパ。各HTMLは `<script src="../../config.js"></script>` → `<script src="api.js"></script>` の順で読込。

### 接続済み画面

| 画面 | 主なAPI呼び出し |
|---|---|
| login.html | `ShiftAPI.login(user_id, password)` → `auth.login` |
| home.html | `ShiftAPI.getSession()`（localStorage） |
| request.html | `ShiftAPI.submitShiftRequests(dates)` → `shiftRequests.create` |
| calendar.html | `ShiftAPI.listMyShiftRequests(month)` → `shiftRequests.list`（status で確定/希望/不承認に振り分け） |
| profile.html | `ShiftAPI.getMe()` → `users.list` から自分の行を抽出 |
| notifications.html | セッションチェックのみ（API未実装） |

### 動作確認方法

1. `work/config.js` の `GAS_ENDPOINT` を実Web App URLに書き換え
2. `python3 -m http.server 8080` で `work/mockup/user/` をローカル起動
3. ブラウザで `http://localhost:8080/login.html` を開く
4. 利用者ID + パスワードでログイン
5. DevTools → Network タブで `auth.login` の payload と response を確認

### モックモードでの確認（GAS_ENDPOINT 未設定時）

`work/config.js` の `GAS_ENDPOINT` がデフォルト値 `__YOUR_DEPLOYMENT_ID__` のままだとモックモード（API呼ばずに固定データで遷移）。ログインは任意のID/パスワードで通る。

### 設計上の選択

- **CORS 回避**: POST は `Content-Type: text/plain;charset=utf-8` で送信し、GAS Web App の preflight (OPTIONS) を発生させない。Body は JSON 文字列。
- **セッション**: `localStorage` に `user_id / name / category` のみ。パスワード・トークンは保持しない。
- **shiftConfirmed.list 未実装の暫定**: `shiftRequests.list` の `status='承認'` を確定扱いとして表示。後続フェーズで `ShiftConfirmed` テーブル参照に切替予定。

## 次のステップ候補

- フィードバック反映（色味・文字サイズ・文言）
- 管理者画面モック（シフト調整・出欠記録・ダッシュボード）
- GAS APIスケルトン実装
