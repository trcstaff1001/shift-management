// シフト管理システム — クライアント設定テンプレート
//
// 使い方:
//   このファイルを `config.js` としてコピーし、実値を記入してください。
//   `config.js` は .gitignore 済み（リポジトリにコミットされない）。

const CONFIG = {
  // スプレッドシートID
  // URLの d/【ここ】/edit から抽出
  // 例: https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
  SPREADSHEET_ID: '__YOUR_SPREADSHEET_ID__',

  // GAS Web App エンドポイント（B工程で取得）
  // GASエディタ → デプロイ → 新しいデプロイ → ウェブアプリ で発行
  GAS_ENDPOINT: 'https://script.google.com/macros/s/__YOUR_DEPLOYMENT_ID__/exec',
};
