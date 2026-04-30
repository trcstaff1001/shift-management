/**
 * シフト確定スプレッドシート自動生成 v1.1
 *
 * 目的: 確定済みシフトを既存運用シートと同等の見た目で出力し、
 *       工賃計算・状態メモ等の既存ワークフローに接続する。
 *
 * 出力フォーマット:
 *   横持ち（1行=1利用者、列=固定項目+日付1〜31+集計）
 *   固定列: ID / カテゴリ / 利用者名 / 工賃 / 通所上限数 / 通所予定数 / 皆勤率
 *   日別列: 値=稼働時間（_Config.default_work_hours）、背景色=区分
 *   集計列: 実績数 / 実稼働(h)
 *
 * 仕様の出典: docs/shift_system_design.md §10
 */

/**
 * メインエントリ。対象月の色付きスプレッドシートを新規生成して URL を返す。
 * @param {string} yearMonth 対象月 'YYYY-MM'
 * @param {number|string} [generatedBy] 実行管理者ID（省略可）
 * @returns {{ spreadsheet_id: string, url: string, generated_at: string }}
 */
function exportShiftSpreadsheet(yearMonth, generatedBy) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error('year_month は YYYY-MM 形式で指定してください: ' + yearMonth);
  }

  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const config = getConfig();
  const defaultWorkHours = Number(config.default_work_hours || 4);
  const offDays = Number(config.monthly_off_days || 8);

  // データ収集
  const allUsers = readTable('Users').filter(u => u.status === '利用中')
    .sort((a, b) => Number(a.user_id) - Number(b.user_id));
  const confirmed = readTable('ShiftConfirmed').filter(r => String(r.date).startsWith(yearMonth));
  const attended  = readTable('Attendances').filter(r => String(r.date).startsWith(yearMonth));

  // インデックス化
  const confirmedByKey = {};
  confirmed.forEach(r => { confirmedByKey[r.user_id + '_' + r.date] = r; });
  const attendedByKey = {};
  attended.forEach(r => { attendedByKey[r.user_id + '_' + r.date] = r; });

  // スプレッドシート生成
  const title = yearMonth + ' シフト確定（自動生成）';
  const newSs = SpreadsheetApp.create(title);
  const sheet = newSs.getActiveSheet();
  sheet.setName(yearMonth);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('@');

  // ヘッダー行を作成・投入
  const headers = _buildHeaderRow(daysInMonth);
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#e8eaed');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);

  // 利用者行を構築（値と書式を分離して収集）
  const rowValues = [];
  const formatJobs = []; // { row, col, bg, bold, strikethrough }

  allUsers.forEach((user, userIdx) => {
    const userId = Number(user.user_id);
    const sheetRow = userIdx + 2; // 1-indexed, row1=header

    const { values, jobs } = _buildUserRow(
      user, userId, yearMonth, daysInMonth, daysInMonth - offDays,
      defaultWorkHours, confirmedByKey, attendedByKey, config, sheetRow
    );
    rowValues.push(values);
    formatJobs.push(...jobs);
  });

  // 値をバッチ書き込み
  if (rowValues.length > 0) {
    sheet.getRange(2, 1, rowValues.length, headers.length).setValues(rowValues);
  }

  // 書式をバッチ適用（Cell単位なので1件ずつ）
  formatJobs.forEach(j => {
    const cell = sheet.getRange(j.row, j.col);
    if (j.bg)            cell.setBackground(j.bg);
    if (j.bold)          cell.setFontWeight('bold');
    if (j.strikethrough) cell.setFontLine('line-through');
  });

  // 固定列の幅調整
  sheet.setColumnWidth(1, 60);   // ID
  sheet.setColumnWidth(2, 80);   // カテゴリ
  sheet.setColumnWidth(3, 120);  // 利用者名
  sheet.setColumnWidth(4, 60);   // 工賃
  sheet.setColumnWidth(5, 70);   // 通所上限数
  sheet.setColumnWidth(6, 70);   // 通所予定数
  sheet.setColumnWidth(7, 70);   // 皆勤率
  // 日別列は 30px に圧縮
  for (let d = 1; d <= daysInMonth; d++) {
    sheet.setColumnWidth(7 + d, 30);
  }

  const url = newSs.getUrl();
  const spreadsheetId = newSs.getId();
  const generatedAt = nowJst();

  // _ExportLogs に記録
  appendRow('_ExportLogs', {
    year_month:     yearMonth,
    spreadsheet_id: spreadsheetId,
    url:            url,
    generated_by:   generatedBy ? Number(generatedBy) : '',
    generated_at:   generatedAt,
    row_count:      rowValues.length,
  });

  Logger.log('エクスポート完了: ' + title + '\n' + url);
  return { spreadsheet_id: spreadsheetId, url, generated_at: generatedAt };
}

// ===== 内部ビルダー =====

/** ヘッダー行を返す（1次元配列）。 */
function _buildHeaderRow(daysInMonth) {
  const fixed = ['ID', 'カテゴリ', '利用者名', '工賃', '通所上限数', '通所予定数', '皆勤率'];
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(d + '日');
  const trailing = ['実績数', '実稼働(h)'];
  return [...fixed, ...days, ...trailing];
}

/**
 * 1利用者分の値と書式ジョブを返す。
 * @returns {{ values: Array, jobs: Array }}
 */
function _buildUserRow(user, userId, yearMonth, daysInMonth, userLimit,
                       defaultWorkHours, confirmedByKey, attendedByKey, config, sheetRow) {
  const jobs = [];

  // 通所予定数（当月の確定件数）
  let confirmedCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = yearMonth + '-' + String(d).padStart(2, '0');
    if (confirmedByKey[userId + '_' + dateStr]) confirmedCount++;
  }

  // 皆勤率 = 通所予定数 ÷ 通所上限数（docs/shift_system_design.md §9.2 #13で確定）
  const attendanceRate = userLimit > 0
    ? Math.round((confirmedCount / userLimit) * 100) + '%'
    : '0%';

  // 実績数（出勤日数）と実稼働（時間合計）
  let actualCount = 0;
  let totalHours = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = yearMonth + '-' + String(d).padStart(2, '0');
    const att = attendedByKey[userId + '_' + dateStr];
    if (att && att.status === '出勤') {
      actualCount++;
      if (att.clock_in && att.clock_out) {
        const inMs  = new Date(att.clock_in).getTime();
        const outMs = new Date(att.clock_out).getTime();
        if (!isNaN(inMs) && !isNaN(outMs) && outMs > inMs) {
          totalHours += (outMs - inMs) / 3600000;
        }
      }
    }
  }

  // 日別セル
  const dayCells = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = yearMonth + '-' + String(d).padStart(2, '0');
    const key = userId + '_' + dateStr;
    const conf = confirmedByKey[key];
    const att  = attendedByKey[key];

    dayCells.push(conf ? String(defaultWorkHours) : '');

    if (conf) {
      const isExternal = String(conf.is_facility_external).toUpperCase() === 'TRUE';
      const bg = isExternal
        ? (config.export_color_external || '#D9D9D9')
        : _getCategoryColor(String(user.category || ''), config);

      const job = { row: sheetRow, col: 7 + d, bg };
      if (att) {
        if (att.status === '出勤')  job.bold = true;
        if (att.status === '欠勤')  job.strikethrough = true;
      }
      jobs.push(job);
    }
  }

  // カテゴリ表示（在宅通所は既存シート互換表記に）
  const categoryExport = String(user.category || '') === '在宅通所' ? '在宅/通所' : String(user.category || '');

  const values = [
    user.user_id,
    categoryExport,
    user.name,
    '',          // 工賃（アプリ管理外）
    userLimit,
    confirmedCount,
    attendanceRate,
    ...dayCells,
    actualCount,
    totalHours > 0 ? parseFloat(totalHours.toFixed(1)) : '',
  ];

  return { values, jobs };
}

/** カテゴリ → 背景色マッピング（_Config の export_color_* を参照）。 */
function _getCategoryColor(category, config) {
  const map = {
    '通所':       config.export_color_attendance || '#FFFFFF',
    '在宅':       config.export_color_home       || '#DCEAF8',
    '在宅(関東)': config.export_color_kanto      || '#D9EAD3',
    '在宅通所':   config.export_color_home       || '#DCEAF8',
  };
  return map[category] || '#FFFFFF';
}

// ===== テスト（GASエディタから直接実行） =====

/** 指定月のエクスポートをテスト実行する。 */
function testExport() {
  const yearMonth = '2026-05';
  Logger.log('エクスポートテスト: ' + yearMonth);
  try {
    const result = exportShiftSpreadsheet(yearMonth);
    Logger.log('✓ 成功: ' + result.url);
  } catch (e) {
    Logger.log('✗ 失敗: ' + e.message);
  }
}
