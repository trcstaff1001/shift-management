/**
 * BusinessDays 一括投入
 *
 * 1年分（デフォルト2026年）の営業日カレンダーを `BusinessDays` タブに投入する。
 *   - 日曜は自動で閉所
 *   - 土曜は開所（事業所が土曜営業の前提。閉所にするなら CLOSE_SATURDAY=true）
 *   - HOLIDAYS の日付は閉所
 *   - 既存行（同一 date）はスキップ（冪等）
 *
 * 実行手順:
 *   1. setupSheets を実行済みのスプレッドシートに本ファイルを貼付
 *   2. 関数 `seedBusinessDays` を実行
 *   3. 完了ログでタブの行数を確認
 *
 * 出典: docs/sheets_schema.md / shift_system_design.md §1.3
 */

// ==================== 設定 ====================

const TARGET_YEAR = 2026;
const CLOSE_SATURDAY = false;  // true にすると土曜も閉所

/**
 * 2026年の日本の祝日（手動メンテ）。
 * 振替休日も含める。誤りに気付いたらここを直して再実行すれば該当行が更新される。
 */
const HOLIDAYS_2026 = [
  { date: '2026-01-01', note: '元日' },
  { date: '2026-01-12', note: '成人の日' },
  { date: '2026-02-11', note: '建国記念の日' },
  { date: '2026-02-23', note: '天皇誕生日' },
  { date: '2026-03-20', note: '春分の日' },
  { date: '2026-04-29', note: '昭和の日' },
  { date: '2026-05-03', note: '憲法記念日' },
  { date: '2026-05-04', note: 'みどりの日' },
  { date: '2026-05-05', note: 'こどもの日' },
  { date: '2026-05-06', note: '振替休日（5/3が日曜のため）' },
  { date: '2026-07-20', note: '海の日' },
  { date: '2026-08-11', note: '山の日' },
  { date: '2026-09-21', note: '敬老の日' },
  { date: '2026-09-23', note: '秋分の日' },
  { date: '2026-10-12', note: 'スポーツの日' },
  { date: '2026-11-03', note: '文化の日' },
  { date: '2026-11-23', note: '勤労感謝の日' },
];

/**
 * 事業所独自の上書き（年末年始休業 / 夏季休業 / 臨時開所など）。
 * 土日・祝日のデフォルト判定よりも**最優先**で適用される。
 *
 * 例:
 *   { date: '2026-12-29', is_open: false, note: '年末休業' },
 *   { date: '2026-08-12', is_open: false, note: '夏季休業' },
 *   { date: '2026-11-23', is_open: true,  note: '勤労感謝の日だが特別開所' },
 */
const OVERRIDES = [
  { date: '2026-12-29', is_open: false, note: '年末休業（暫定）' },
  { date: '2026-12-30', is_open: false, note: '年末休業（暫定）' },
  { date: '2026-12-31', is_open: false, note: '年末休業（暫定）' },
  // 1/1〜1/3 は祝日 or 日曜で既に閉所判定されるが、念のためnote上書き例
  // { date: '2026-01-02', is_open: false, note: '正月休み' },
  // { date: '2026-01-03', is_open: false, note: '正月休み' },
];

// ==================== メイン ====================

function seedBusinessDays() {
  const year = TARGET_YEAR;
  const holidayMap = {};
  HOLIDAYS_2026.forEach(h => { holidayMap[h.date] = h.note; });
  const overrideMap = {};
  OVERRIDES.forEach(o => { overrideMap[o.date] = o; });

  const existing = readTable('BusinessDays');
  const existingDates = new Set(existing.map(r => String(r.date)));

  const toInsert = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    if (existingDates.has(dateStr)) continue;

    const dow = d.getDay();  // 0=Sun, 6=Sat
    const dowName = ['日', '月', '火', '水', '木', '金', '土'][dow];

    let isOpen = true;
    let note = '';

    // 1. 曜日デフォルト
    if (dow === 0) {
      isOpen = false;
      note = '日曜';
    } else if (dow === 6 && CLOSE_SATURDAY) {
      isOpen = false;
      note = '土曜';
    }
    // 2. 祝日（曜日デフォルトを上書き）
    if (holidayMap[dateStr]) {
      isOpen = false;
      note = holidayMap[dateStr];
    }
    // 3. 事業所独自上書き（最優先・is_open も上書き）
    if (overrideMap[dateStr]) {
      isOpen = overrideMap[dateStr].is_open;
      note = overrideMap[dateStr].note || note;
    }

    toInsert.push([dateStr, isOpen ? 'TRUE' : 'FALSE', dowName, note]);
  }

  if (toInsert.length === 0) {
    Logger.log('追加する日付なし。既存 ' + existing.length + ' 行はそのまま。');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BusinessDays');
  if (!sheet) throw new Error('BusinessDays タブが存在しません。先に setupSheets を実行してください。');

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, toInsert.length, 4).setValues(toInsert);

  // date列をテキスト固定（ロケールで日付化されないように）
  sheet.getRange(startRow, 1, toInsert.length, 1).setNumberFormat('@');

  Logger.log(year + '年の BusinessDays を ' + toInsert.length + '行 投入しました。');
  Logger.log('  - 開所: ' + toInsert.filter(r => r[1] === 'TRUE').length + '日');
  Logger.log('  - 閉所: ' + toInsert.filter(r => r[1] === 'FALSE').length + '日');
  Logger.log('  - 既存（スキップ）: ' + existing.length + '行');
}

/**
 * 既存の BusinessDays を全削除して再投入したい場合に使う（破壊的）。
 * 通常は seedBusinessDays（冪等）を使うこと。
 */
function resetBusinessDays() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BusinessDays');
  if (!sheet) throw new Error('BusinessDays タブが存在しません。');
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    Logger.log('既存 ' + (lastRow - 1) + ' 行を削除しました。');
  }
  seedBusinessDays();
}
