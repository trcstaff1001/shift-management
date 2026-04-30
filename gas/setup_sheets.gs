/**
 * シフト管理システム — Google Sheets 初期化・マイグレーションスクリプト v1.1
 *
 * 仕様の出典: docs/sheets_schema.md v1.1
 * 冪等: 再実行しても既存データは保持し、ヘッダーと書式のみ再適用する。
 *
 * 使い方（新規セットアップ）:
 *   1. 新規Googleスプレッドシートに紐づくApps Scriptエディタで本ファイルを貼付
 *   2. 関数 `setupSheets` を選択して実行
 *   3. 初回のみ権限承認
 *
 * 使い方（v1.0 → v1.1 マイグレーション）:
 *   既に v1.0 スプレッドシートがある場合は `migrateToV11` を実行する。
 *   既存データは保持し、不足カラムを末尾に追記する。
 */

// タブ定義 — docs/sheets_schema.md v1.1 と1対1で同期すること
const TAB_SCHEMA = [
  {
    name: 'Users',
    headers: [
      'user_id','name','email','password_hash','category','status',
      'chatwork_room_id',          // v1.1新規: ChatWork個別ルームID
      'invited_at','activated_at','created_at','updated_at',
    ],
  },
  {
    name: 'Admins',
    headers: ['admin_id','name','email','password_hash','role','created_at','updated_at'],
  },
  {
    name: 'BusinessDays',
    headers: ['date','is_open','day_of_week','note'],
  },
  {
    name: 'ShiftRequests',
    headers: ['request_id','user_id','date','status','submitted_at','updated_at'],
  },
  {
    name: 'ShiftConfirmed',
    headers: ['confirmed_id','user_id','date','is_facility_external','source','confirmed_by','confirmed_at'],
  },
  {
    name: 'Attendances',
    headers: [
      'attendance_id','user_id','date','status',
      'clock_in',     // v1.1新規: 利用者打刻（出勤時刻）
      'clock_out',    // v1.1新規: 利用者打刻（退勤時刻）
      'source',       // v1.1新規: self_clock / admin_record / admin_override
      'recorded_by',  // v1.1で任意化（self_clockの場合は空）
      'recorded_at','note',
    ],
  },
  {
    name: 'Notifications',
    headers: [
      'notification_id','user_id','type','target_date','message','is_read',
      'mail_sent_at',
      'chatwork_sent_at',    // v1.1新規
      'chatwork_message_id', // v1.1新規
      'chatwork_error',      // v1.1新規
      'created_at',
    ],
  },
  {
    name: '_Config',
    headers: ['key','value','description'],
  },
  {
    name: '_ExportLogs',  // v1.1新規: シフト確定スプレッドシート生成履歴
    headers: ['export_id','year_month','spreadsheet_id','url','generated_by','generated_at','row_count','note'],
  },
];

// _Config 初期値 — マジックナンバー禁止ルール（CLAUDE.md）の実体
const CONFIG_SEED = [
  // 規定値
  ['capacity',                        '20',       '定員'],
  ['daily_rate',                      '1.5',      '1日制約の倍率（150%）'],
  ['monthly_rate',                    '1.25',     '月間制約の倍率（125%）'],
  ['monthly_off_days',                '8',        '月の利用上限算出用（月日数 - この値）'],
  ['submission_deadline_days_before', '15',       '翌月分の希望提出締切（月初の◯日前）'],
  // エクスポート（v1.1）
  ['default_work_hours',              '4',        'エクスポート時の日別セル既定値（稼働時間）'],
  // ChatWork（v1.1）
  ['chatwork_dry_run',                'FALSE',    'TRUEにするとChatWork投稿をスキップしログのみ出力（テスト用）'],
  // エクスポート背景色（v1.1）— 実際のシートの色コードに合わせて上書き可能
  ['export_color_attendance',         '#FFFFFF',  'エクスポート色: 通所'],
  ['export_color_home',               '#DCEAF8',  'エクスポート色: 在宅'],
  ['export_color_kanto',              '#D9EAD3',  'エクスポート色: 関東面談（在宅(関東)の通所日）'],
  ['export_color_external',           '#D9D9D9',  'エクスポート色: 施設外'],
  ['export_color_offday',             '#FCE5CD',  'エクスポート色: 希望休（不承認日）'],
];

const HEADER_BG = '#e8eaed';

/**
 * メインセットアップ関数。新規スプレッドシートに対して実行する。
 * 既存タブは保持し、ヘッダーと書式のみ再適用する（冪等）。
 */
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
    '✓ セットアップ完了 (v1.1)',
    '新規作成: ' + (created.join(', ') || 'なし'),
    'ヘッダー再適用: ' + (updated.join(', ') || 'なし'),
    'スプレッドシートID:',
    ss.getId(),
  ].join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* UI不可コンテキストは無視 */ }
}

/**
 * v1.0 → v1.1 マイグレーション。
 * 既にデータが入っているスプレッドシートに対して実行する。
 * 不足カラムを末尾に追記する（既存列の並び替えは行わない）。
 * 既存データは一切変更しない。
 */
function migrateToV11() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];

  const migrations = {
    'Users':         ['chatwork_room_id'],
    'Attendances':   ['clock_in', 'clock_out', 'source'],
    'Notifications': ['chatwork_sent_at', 'chatwork_message_id', 'chatwork_error'],
    '_Config':       [], // 行追加で対応（後段で処理）
    '_ExportLogs':   null, // タブ新設で対応
  };

  // カラム追加
  for (const [tabName, newCols] of Object.entries(migrations)) {
    if (newCols === null) continue; // 新規タブは別処理

    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      report.push(`⚠ ${tabName}: タブが存在しません（setupSheets を先に実行してください）`);
      continue;
    }
    if (newCols.length === 0) continue;

    const lastCol = sheet.getLastColumn();
    const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const added = [];

    newCols.forEach(col => {
      if (!existingHeaders.includes(col)) {
        const nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, nextCol).setValue(col)
             .setFontWeight('bold').setBackground(HEADER_BG).setNumberFormat('@');
        added.push(col);
      }
    });

    report.push(`${tabName}: ${added.length > 0 ? '追加 → ' + added.join(', ') : '変更なし'}`);
  }

  // _ExportLogs 新設
  const exportLogsTab = TAB_SCHEMA.find(t => t.name === '_ExportLogs');
  if (!ss.getSheetByName('_ExportLogs')) {
    const sheet = ss.insertSheet('_ExportLogs');
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('@');
    const hr = sheet.getRange(1, 1, 1, exportLogsTab.headers.length);
    hr.setValues([exportLogsTab.headers]).setFontWeight('bold').setBackground(HEADER_BG);
    sheet.setFrozenRows(1);
    report.push('_ExportLogs: 新規作成');
  } else {
    report.push('_ExportLogs: 既存（変更なし）');
  }

  // _Config に新キーを追加（未登録のものだけ末尾追記）
  const configSheet = ss.getSheetByName('_Config');
  if (configSheet) {
    const existing = configSheet.getLastRow() > 1
      ? configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues().flat()
      : [];
    const existingKeys = new Set(existing.map(String));
    const toAdd = CONFIG_SEED.filter(row => !existingKeys.has(row[0]));
    if (toAdd.length > 0) {
      configSheet.getRange(configSheet.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
    }
    report.push(`_Config: ${toAdd.length > 0 ? toAdd.length + '件追加 → ' + toAdd.map(r => r[0]).join(', ') : '変更なし'}`);
  }

  const msg = ['✓ v1.1 マイグレーション完了', ...report].join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* noop */ }
}
