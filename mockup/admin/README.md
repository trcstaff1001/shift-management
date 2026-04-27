# 管理者画面 モックアップ v0.2

設計書 §4.2 / §6.2 / §6.3 / §7.6 に基づく管理者向け画面のHTMLモック。
デスクトップ前提（max-width 1280px）、左サイドバー + 右コンテンツ構成、Vanilla JS。

## 画面一覧

| ファイル | 画面 | 主機能 |
|---|---|---|
| login.html | ログイン | 管理者ログイン |
| dashboard.html | ダッシュボード | KPI / 3ヶ月平均推移 / 本日の出欠 / 対応待ち |
| **adjust.html** | **シフト調整（★コア）** | 縦軸=利用者・横軸=日付の表、セルクリックで状態切替、当日合計+規定アラート、**確定モーダル**（v0.2）、**月切替**（v0.2） |
| attendance.html | 出欠管理 | 通所予定者リスト、出勤/欠勤タップ切替、**前日/翌日ナビ**（v0.2） |
| users.html | 利用者管理 | 一覧+検索、新規招待モーダル、ダミーID発行、**代理入力ボタン → proxy_request**（v0.2） |
| business_days.html | 営業日カレンダー | 月別カレンダー、クリックで開所/閉所切替、開所日数を即時反映、**月切替**（v0.2） |
| **proxy_request.html** | **代理入力**（v0.2新規） | 利用者選択 → カレンダーで支援員が代入力、月切替対応 |
| **notifications.html** | **通知配信履歴**（v0.2新規） | Notifications を表表示、期間/種別/利用者/状態で絞り込み、失敗時の再送信 |

## 動くポイント

- **シフト調整 (adjust.html)**: セルをクリックすると `空 → 希望 → 承認 → 不承認 → 施設外 → 空` でサイクル。日別合計が即時更新、28名以上で警告色、30名で危険色（規定 §7.6 ハードブロック相当）
- **シフト確定モーダル (adjust.html, v0.2)**: 「この月を確定」ボタンで規定違反を集計表示。ハードブロック（1日30名 / 単月125%超 / 利用者上限超）があれば確定不可。ソフトアラート（1日28〜29名 / 単月120%超）は確認チェック必須で進行可
- **出欠管理 (attendance.html)**: 出勤/欠勤ボタンの切替で状態保持。**前日/翌日ナビ**（v0.2）と日付ピッカーで任意日へ移動
- **営業日 (business_days.html)**: 日付クリックで開所/閉所トグル、開所日数と月間上限を即時再計算
- **利用者管理 (users.html)**: 招待モーダル、ダミーID発行ボタン、**代理入力ボタン → proxy_request.html?uid=xxxxx**（v0.2、停止/退所ユーザーは無効化）
- **代理入力 (proxy_request.html, v0.2)**: 利用者を選択 → カレンダーで希望日トグル。利用者上限を超える選択はブロック。提出時に `user_id` 込みでAPI想定ペイロードをalert表示
- **通知配信履歴 (notifications.html, v0.2)**: Notificationsを表表示。期間・種別・利用者名・送信状態で絞り込み。failed行は再送信ボタン表示

## 確認方法

```
open work/mockup/admin/login.html
```

または:

```
cd work/mockup/admin
python3 -m http.server 8080
# → http://localhost:8080/login.html
```

## デザイン方針

- 利用者画面と同じデザイントークン（白/青/ゴシック）
- ダークサイドバー（`#1a202c`）でコンテキスト切替を視覚的に分離
- 表は横スクロール、ヘッダ・利用者列・合計列をスティッキー固定
- アラートは情報/警告/危険の3階層、規定 §7.6 のハード/ソフト/情報に対応

## 月切替の状態保持

- adjust / business_days / proxy_request: URLハッシュ `#month=YYYY-MM` で保持
- attendance: URLハッシュ `#date=YYYY-MM-DD` で保持（日次粒度）
- ハッシュ無しの場合は `2026-05`（adjust/business_days/proxy）/ `2026-04-27`（attendance）が初期値
- ブラウザの戻る/進むで履歴をたどれる

## v0.2 で追加した規定判定（モーダル）

設計書 §7.6 の3パターン分岐（ハード/ソフト/情報）と現行規定（2026-04-27改定）に整合:

| 種別 | 条件 | モーダル挙動 |
|---|---|---|
| ハードブロック | 1日 ≥30名 / 単月利用率 >125% / 利用者上限 >日数-8 | 違反一覧表示、確定ボタン disabled |
| ソフトアラート | 1日 28〜29名 / 単月利用率 >120% かつ ≤125% | 警告一覧表示、承知チェックボックス必須で確定可 |
| 規定違反なし | 上記いずれにも該当しない | 「確定する」ボタンが即押下可 |

> **注**: 設計書 §7.6 のテキストは旧仕様（3ヶ月平均判定）のまま残っています。コードと UI は最新仕様（単月判定）で実装済み。次回設計書見直しで §7.6 を最新仕様に書き換える必要あり。

## API 接続状況（v0.2 + 2026-04-27 着手）

| 画面 | API接続 |
|---|---|
| login.html | 未（フェーズ1ではadmin認証なし、画面間の制限のみ） |
| dashboard.html | 未 |
| adjust.html | 未 |
| attendance.html | 未（既知バグ要修正） |
| **users.html** | **済 — `listUsers` + `shiftRequests.list` 集計、招待モーダルは alert のみ** |
| business_days.html | 未 |
| proxy_request.html | 未 |
| notifications.html | 未 |

`admin/api.js` は `ShiftAdminAPI` グローバルで提供:
- `getConfig()` — `_Config` 全値
- `listUsers(status?)` — Users 一覧
- `inviteUser(payload)` — users.invite
- `listShiftRequests(params)` — ShiftRequests 絞り込み

CONFIG.GAS_ENDPOINT がプレースホルダのときは自動でモックモード（固定ダミーデータ）。

## 未実装（v0.3 以降）

- 利用者詳細・編集画面（users.html の「編集」ボタンの遷移先）
- attendance.html のバグ修正（render() 内での状態リセット問題）
- adjust.html / dashboard.html / business_days.html / proxy_request.html / notifications.html の API 接続
- 招待モーダルの実APIフロー（現在 alert のみ）
- 通知の絞り込み結果の CSV エクスポート（管理者の月次報告用）
- ダッシュボードの規定推移グラフを最新仕様（単月）に再設計
