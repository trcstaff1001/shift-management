/**
 * 規定境界テストデータ — `ShiftConfirmed` シーダー
 *
 * 規定 §7 の各境界を意図的に踏むシナリオで `ShiftConfirmed` を生成し、
 * `testRules` (rules.gs) では拾えない**実データ集計時の境界判定**を検証可能にする。
 *
 * ----- 規定 (CLAUDE.md / shift_system_design.md §1.3 / §7.3) -----
 *   - 1日制約: 同日 is_facility_external=FALSE の行数 < capacity × daily_rate (= 30)
 *              → 30名到達でNG、29名以下OK
 *   - 月間制約: 月の利用率 = 月内 is_facility_external=FALSE / (開所日数 × capacity)
 *              **単月で `monthly_rate` (=1.25) 超でNG**（2026-04-27に3ヶ月平均から単月判定に変更）
 *   - 利用者月内上限: 同 user_id × 同月の件数 ≤ 月の日数 - monthly_off_days (=8)
 *              → 上限ちょうどはOK、超過でNG
 *
 * ----- 前提 -----
 *   - setupSheets / seedBusinessDays / migrateUsers (or seedUsersFromTemplate) 実行済み
 *   - Users.status='利用中' の行が **30名以上** 必要
 *   - 対象月 (TARGET_MONTH) の開所日が `BusinessDays` に登録済み
 *
 * ----- シナリオ -----
 *   seedSafe                — 規定全クリア (~110%、境界に触れない)
 *   seedBoundaryOK          — OK境界に張り付く (月間~124%、1ユーザー上限ちょうど、1日29名)
 *   seedBoundaryNgMonthly   — 月間NG境界 (~126%)
 *   seedBoundaryNgDaily     — 1日NG境界 (1日30名・全員施設内)
 *   clearShiftConfirmedForMonth — 対象月のテストデータ全削除
 *
 *  各関数は冒頭で対象月の既存 ShiftConfirmed をクリアしてから生成する（重複防止）。
 */

// ==================== 設定 ====================

const TARGET_MONTH = '2026-05';     // YYYY-MM
const TARGET_USERS_COUNT = 30;      // 何名分のシフトを生成するか

// ==================== バッチ書き込みヘルパー ====================

/**
 * `ShiftConfirmed` への一括書き込み。
 * appendRow を回すと Lock の度に遅いので、Lock を1回だけ取得して setValues。
 * ID は連番採番、confirmed_at は JST 現在時刻。
 */
function _batchAppendShiftConfirmed(rows) {
  if (!rows.length) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ShiftConfirmed');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let nextId = _nextId(sheet, headers.indexOf('confirmed_id') + 1);
    const now = nowJst();

    const values = rows.map(r => headers.map(h => {
      switch (h) {
        case 'confirmed_id': return nextId++;
        case 'confirmed_at': return r.confirmed_at || now;
        case 'is_facility_external':
          return r.is_facility_external ? 'TRUE' : 'FALSE';
        case 'source': return r.source || '通常確定';
        case 'confirmed_by': return r.confirmed_by != null ? r.confirmed_by : '';
        default: return r[h] != null ? r[h] : '';
      }
    }));

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
    return values.length;
  } finally {
    lock.releaseLock();
  }
}

// ==================== 共通 ====================

function _loadContext() {
  const config = getConfig();
  const capacity = Number(config.capacity || 20);
  const dailyRate = Number(config.daily_rate || 1.5);
  const monthlyRate = Number(config.monthly_rate || 1.25);
  const monthlyOffDays = Number(config.monthly_off_days || 8);

  const users = readTable('Users')
    .filter(u => u.status === '利用中')
    .map(u => ({ user_id: Number(u.user_id), name: u.name, category: u.category }));

  if (users.length < TARGET_USERS_COUNT) {
    throw new Error('Users.status=利用中 が ' + TARGET_USERS_COUNT + ' 名必要です。現在 ' + users.length + ' 名。先に migrateUsers / seedUsersFromTemplate を実行してください。');
  }

  const allDays = readTable('BusinessDays');
  const openDays = allDays
    .filter(b => String(b.date).startsWith(TARGET_MONTH))
    .filter(b => String(b.is_open).toUpperCase() === 'TRUE')
    .map(b => String(b.date))
    .sort();

  if (openDays.length === 0) {
    throw new Error('BusinessDays に ' + TARGET_MONTH + ' の開所日がありません。先に seedBusinessDays を実行してください。');
  }

  // 月の日数
  const [y, m] = TARGET_MONTH.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const userLimit = daysInMonth - monthlyOffDays;

  return {
    capacity, dailyRate, monthlyRate, monthlyOffDays,
    users: users.slice(0, TARGET_USERS_COUNT),
    openDays,
    daysInMonth,
    userLimit,
    dailyLimit: capacity * dailyRate,                 // 30
    monthlyLimit: openDays.length * capacity * monthlyRate, // 例: 23×20×1.25 = 575
  };
}

function _logSummary(label, rows, ctx) {
  const dayCount = {};
  const userCount = {};
  let external = 0;
  rows.forEach(r => {
    dayCount[r.date] = (dayCount[r.date] || 0) + (r.is_facility_external ? 0 : 1);
    userCount[r.user_id] = (userCount[r.user_id] || 0) + 1;
    if (r.is_facility_external) external++;
  });
  const totalNonExternal = Object.values(dayCount).reduce((a, b) => a + b, 0);
  const monthlyRatio = (totalNonExternal / (ctx.openDays.length * ctx.capacity)) * 100;
  const maxDay = Math.max(...Object.values(dayCount));
  const maxUser = Math.max(...Object.values(userCount));

  Logger.log('===== ' + label + ' =====');
  Logger.log('生成行数:           ' + rows.length + ' (うち施設外 ' + external + ')');
  Logger.log('1日最大(施設外除く):' + maxDay + ' / 上限 ' + (ctx.dailyLimit - 1));
  Logger.log('利用者最大:         ' + maxUser + '日 / 上限 ' + ctx.userLimit + '日');
  Logger.log('月間延べ(施設外除):' + totalNonExternal + ' / 上限 ' + ctx.monthlyLimit + ' (' + monthlyRatio.toFixed(2) + '%)');
}

function _clearMonthInternal(month) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ShiftConfirmed');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];
  const dateCol = headers.indexOf('date');
  if (dateCol < 0) throw new Error('date 列が見つかりません');

  const keep = [headers];
  let removed = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][dateCol]).startsWith(month)) {
      removed++;
    } else if (values[i].some(v => v !== '' && v !== null)) {
      keep.push(values[i]);
    }
  }
  sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  sheet.getRange(1, 1, keep.length, lastCol).setValues(keep);
  return removed;
}

function clearShiftConfirmedForMonth(month) {
  const m = month || TARGET_MONTH;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const removed = _clearMonthInternal(m);
    Logger.log(m + ' の ShiftConfirmed を ' + removed + '行 削除しました');
  } finally {
    lock.releaseLock();
  }
}

// ==================== シナリオ ====================

/**
 * ✅ 規定全クリア。月間 ~110%、ユーザーは平均15日前後、1日最大~24名。
 */
function seedSafe() {
  const ctx = _loadContext();
  _clearMonthInternal(TARGET_MONTH);

  // 各ユーザーに 14〜16 日をランダム配分（平均15）
  const rows = [];
  ctx.users.forEach((u, i) => {
    const daysCount = 14 + (i % 3);   // 14, 15, 16の循環
    const picked = _pickDays(ctx.openDays, daysCount, i);
    picked.forEach(date => rows.push({
      user_id: u.user_id,
      date: date,
      is_facility_external: (i % 9 === 0),  // 約11%施設外
      source: '通常確定',
    }));
  });

  const inserted = _batchAppendShiftConfirmed(rows);
  _logSummary('seedSafe (~110%)', rows, ctx);
  Logger.log('insert: ' + inserted + ' rows');
}

/**
 * 🟡 OK境界に張り付く。
 *   - 月間 ~124% (OK境界、`monthly_rate` 直前)
 *   - User[0] ちょうど上限 (5月なら23日) — OK境界
 *   - 1日 29名 (施設外除く) — OK境界
 *   - 施設外を散らす（分母除外の動作確認用）
 */
function seedBoundaryOK() {
  const ctx = _loadContext();
  _clearMonthInternal(TARGET_MONTH);

  const rows = [];
  // User[0]: 全 開所日 を入れる → ちょうど userLimit 日（23日）
  ctx.users[0] && ctx.openDays.slice(0, ctx.userLimit).forEach(date => rows.push({
    user_id: ctx.users[0].user_id,
    date: date,
    is_facility_external: false,
    source: '通常確定',
  }));

  // それ以外のユーザーは均等配分で月間 124% を目指す
  // 目標延べ = 23 * 20 * 1.24 = 570、user[0]分(23) を引いて残り 547 を 29名で配る = 約19日/人
  const remainingTarget = Math.floor(ctx.openDays.length * ctx.capacity * 1.24) - ctx.userLimit;
  const perUser = Math.round(remainingTarget / (ctx.users.length - 1));
  ctx.users.slice(1).forEach((u, i) => {
    const days = Math.min(perUser, ctx.userLimit);
    const picked = _pickDays(ctx.openDays, days, i + 1);
    picked.forEach(date => rows.push({
      user_id: u.user_id,
      date: date,
      is_facility_external: (i % 8 === 0),   // 一部施設外
      source: '通常確定',
    }));
  });

  // 1日29名(施設外除く) の "OK境界" を openDays[0] に作る
  _ensureDayCount(rows, ctx.openDays[0], 29, ctx.users, false);

  const inserted = _batchAppendShiftConfirmed(rows);
  _logSummary('seedBoundaryOK (1日29 / ユーザー上限ちょうど / 月間~124%)', rows, ctx);
  Logger.log('insert: ' + inserted + ' rows');
}

/**
 * 🔴 月間NG境界。`monthly_rate` を超える状態を意図的に作る (~126%)。
 */
function seedBoundaryNgMonthly() {
  const ctx = _loadContext();
  _clearMonthInternal(TARGET_MONTH);

  const rows = [];
  // 目標 = 23*20*1.26 = 580、施設外なし、各ユーザーに均等配分
  const targetTotal = Math.ceil(ctx.openDays.length * ctx.capacity * 1.26);
  const perUser = Math.min(Math.ceil(targetTotal / ctx.users.length), ctx.userLimit);
  ctx.users.forEach((u, i) => {
    const picked = _pickDays(ctx.openDays, perUser, i);
    picked.forEach(date => rows.push({
      user_id: u.user_id,
      date: date,
      is_facility_external: false,
      source: '通常確定',
    }));
  });

  const inserted = _batchAppendShiftConfirmed(rows);
  _logSummary('seedBoundaryNgMonthly (~126% NG境界)', rows, ctx);
  Logger.log('insert: ' + inserted + ' rows');
}

/**
 * 🔴 1日NG境界。`openDays[0]` に30名・全員施設内を配置。
 */
function seedBoundaryNgDaily() {
  const ctx = _loadContext();
  if (ctx.users.length < 30) throw new Error('1日30名NG境界の生成には Users 30名以上が必要');
  _clearMonthInternal(TARGET_MONTH);

  const rows = [];
  // 1日NG境界: openDays[0] に30人全員施設内
  ctx.users.slice(0, 30).forEach(u => rows.push({
    user_id: u.user_id,
    date: ctx.openDays[0],
    is_facility_external: false,
    source: '通常確定',
  }));

  // ベースとして他のユーザーに ~10日ずつ配布 (月間影響を抑える)
  ctx.users.slice(0, 20).forEach((u, i) => {
    const picked = _pickDays(ctx.openDays.slice(1), 8, i);
    picked.forEach(date => rows.push({
      user_id: u.user_id,
      date: date,
      is_facility_external: false,
      source: '通常確定',
    }));
  });

  const inserted = _batchAppendShiftConfirmed(rows);
  _logSummary('seedBoundaryNgDaily (1日30名 NG境界)', rows, ctx);
  Logger.log('insert: ' + inserted + ' rows');
}

// ==================== 補助 ====================

/** 決定論的に N 日選ぶ（i 番目のユーザーごとに開始位置をズラす） */
function _pickDays(allDays, n, seed) {
  const offset = (seed * 3) % allDays.length;
  const result = [];
  for (let i = 0; i < n && i < allDays.length; i++) {
    result.push(allDays[(offset + i) % allDays.length]);
  }
  return result;
}

/** rows 配列を編集して、指定日の(施設外除く)件数を target に揃える */
function _ensureDayCount(rows, date, target, users, external) {
  const onThatDay = rows.filter(r => r.date === date && !r.is_facility_external);
  const currentUserSet = new Set(onThatDay.map(r => r.user_id));
  let need = target - onThatDay.length;
  for (let i = 0; need > 0 && i < users.length; i++) {
    if (currentUserSet.has(users[i].user_id)) continue;
    rows.push({
      user_id: users[i].user_id,
      date: date,
      is_facility_external: external,
      source: '通常確定',
    });
    need--;
  }
}
