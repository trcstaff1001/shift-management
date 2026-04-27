/**
 * シフト管理システム — Google Sheets 初期化スクリプト
 *
 * 仕様の出典: docs/sheets_schema.md
 * 冪等: 再実行しても既存データは保持し、ヘッダーと書式のみ再適用する。
 *
 * 使い方:
 *   1. 新規Googleスプレッドシートに紐づくApps Scriptエディタで本ファイルを貼付
 *   2. 関数 `setupSheets` を選択して実行
 *   3. 初回のみ権限承認（自スプレッドシート編集のみ要求）
 */

// タブ定義 — docs/sheets_schema.md と1対1で同期すること
const TAB_SCHEMA = [
  { name: 'Users',          headers: ['user_id','name','email','password_hash','category','status','invited_at','activated_at','created_at','updated_at'] },
  { name: 'Admins',         headers: ['admin_id','name','email','password_hash','role','created_at','updated_at'] },
  { name: 'BusinessDays',   headers: ['date','is_open','day_of_week','note'] },
  { name: 'ShiftRequests',  headers: ['request_id','user_id','date','status','submitted_at','updated_at'] },
  { name: 'ShiftConfirmed', headers: ['confirmed_id','user_id','date','is_facility_external','source','confirmed_by','confirmed_at'] },
  { name: 'Attendances',    headers: ['attendance_id','user_id','date','status','recorded_by','recorded_at','note'] },
  { name: 'Notifications',  headers: ['notification_id','user_id','type','target_date','message','is_read','mail_sent_at','created_at'] },
  { name: '_Config',        headers: ['key','value','description'] },
];

// _Config 初期値 — マジックナンバー禁止ルール（CLAUDE.md）の実体
const CONFIG_SEED = [
  ['capacity',                        '20',   '定員'],
  ['daily_rate',                      '1.5',  '1日制約の倍率（150%）'],
  ['monthly_rate',                    '1.25', '月間制約の倍率（125%）'],
  ['monthly_off_days',                '8',    '月の利用上限算出用（月日数 - この値）'],
  ['submission_deadline_days_before', '15',   '翌月分の希望提出締切（月初の◯日前）'],
];

const HEADER_BG = '#e8eaed';

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const updated = [];

  TAB_SCHEMA.forEach((tab, idx) => {
    let sheet = ss.getSheetByName(tab.name);
    let isNew = false;
    if (!sheet) {
      sheet = ss.insertSheet(tab.name, idx);
      isNew = true;
      created.push(tab.name);
    } else {
      updated.push(tab.name);
    }

    // 全セルをプレーンテキスト書式（日付・日時の自動変換を防ぐ）
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns())
         .setNumberFormat('@');

    // ヘッダー投入＋装飾
    const headerRange = sheet.getRange(1, 1, 1, tab.headers.length);
    headerRange.setValues([tab.headers]);
    headerRange.setFontWeight('bold').setBackground(HEADER_BG);
    sheet.setFrozenRows(1);

    // _Config 初期値（新規作成時のみ投入 — 既存値は上書きしない）
    if (tab.name === '_Config' && isNew) {
      sheet.getRange(2, 1, CONFIG_SEED.length, 3).setValues(CONFIG_SEED);
    }

    // 並び順を強制
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(idx + 1);
  });

  // デフォルトタブを削除（他タブが揃った後に実行）
  ['シート1', 'Sheet1'].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  const msg = [
    '✓ セットアップ完了',
    '新規作成: ' + (created.join(', ') || 'なし'),
    'ヘッダー再適用: ' + (updated.join(', ') || 'なし'),
    'スプレッドシートID:',
    ss.getId(),
  ].join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* UI不可コンテキストは無視 */ }
}
