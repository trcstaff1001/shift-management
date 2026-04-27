# Google Sheets 雛形

シフト管理システム用のスプレッドシート雛形（CSV）。

## 構成

各 CSV = 1タブ。ヘッダー行のみ（`_Config.csv` だけは初期値入り）。
スキーマ詳細は [../../docs/sheets_schema.md](../../docs/sheets_schema.md) 参照。

| ファイル | タブ名 | 用途 |
|---|---|---|
| Users.csv | Users | 利用者マスタ |
| Admins.csv | Admins | 管理者マスタ |
| BusinessDays.csv | BusinessDays | 営業日カレンダー |
| ShiftRequests.csv | ShiftRequests | シフト希望 |
| ShiftConfirmed.csv | ShiftConfirmed | シフト確定 |
| Attendances.csv | Attendances | 出欠記録 |
| Notifications.csv | Notifications | 通知（メール送信ログ + アプリ内バッジ） |
| _Config.csv | _Config | 設定値（定員・上限率等） |

## Google スプレッドシートへの取り込み手順

1. Google ドライブで新規スプレッドシート作成（名前: `シフト管理システム_本番` 等）
2. デフォルトの「シート1」タブ名を `Users` に変更
3. `Users.csv` を開いて全選択コピー → スプレッドシートに貼り付け（A1セルから）
4. 下部の `+` でタブを追加し、`Admins`, `BusinessDays`, ... と順に作成
5. 各タブで対応する CSV を貼り付け
6. 全タブで1行目をフリーズ（表示 → 固定 → 1行）し、ヘッダー行を太字＋背景色で装飾推奨

## 推奨設定

- 表示形式: **すべての列をプレーンテキスト**に設定（日付・日時の自動変換を防ぐ）
  - 列を選択 → 表示形式 → 数字 → プレーンテキスト
- スプレッドシートIDは GAS / クライアント JS の設定値として控える
- 共有設定: 当面は管理者のみ編集可、利用者には共有しない（アプリ経由でのみアクセス）

## 初期データ投入

- `_Config` は雛形の値で起動可。サビ管確認後に値を調整。
- `BusinessDays` は年初にまとめて1年分投入する運用（土日祝・特別休業日を反映）。
- `Users` は既存Excel（月別シート）から移行。詳細は設計書 Appendix A 参照。
