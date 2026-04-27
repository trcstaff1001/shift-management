/**
 * 規定計算3関数（設計書 §7）
 *
 * 全てサーバ側 write 前検証用。クライアント側でも同等ロジックを実装し
 * UX（リアルタイム警告）に使う想定（二重実装。サーバ側を「正」とする）。
 *
 * 共通の戻り値:
 *   { ok: boolean, level: 'ok'|'warning'|'ng', reason?: string, detail?: object }
 *   - ok=true でも level='warning' の場合あり（単月超過など）
 *   - ok=false は書き込み拒否対象
 *
 * 規定:
 *   1. 1日制約: 同日 confirmed の非・施設外件数 < capacity × daily_rate (=30名で NG)
 *   2. 月間制約: 当月の月間利用率が monthly_rate (1.25) 超で NG（単月判定）
 *   3. 利用者月内上限: 同 user × 同月の確定件数 ≤ 月の日数 - monthly_off_days
 *   - 施設外フラグ TRUE は全規定の分母から除外
 */

/**
 * 1日制約チェック
 * @param {string} date 'YYYY-MM-DD'
 * @param {Array} confirmedRows ShiftConfirmed の全行（または当日のみ）
 * @param {object} config getConfig() の結果
 */
function checkDailyConstraint(date, confirmedRows, config) {
  const limit = Number(config.capacity) * Number(config.daily_rate);
  const sameDay = confirmedRows.filter(r =>
    r.date === date && String(r.is_facility_external).toUpperCase() !== 'TRUE'
  );
  const count = sameDay.length;

  if (count >= limit) {
    return {
      ok: false, level: 'ng',
      reason: `1日上限到達: ${date} に既に ${count} 名（上限 ${limit}）`,
      detail: { date, count, limit },
    };
  }
  return { ok: true, level: 'ok', detail: { date, count, limit } };
}

/**
 * 月間制約チェック（単月で判定）
 * @param {string} targetMonth 'YYYY-MM'（書き込み対象月）
 * @param {Array} confirmedRows ShiftConfirmed の全行（少なくとも当月を含むこと）
 * @param {Array} businessDayRows BusinessDays の全行
 * @param {object} config
 */
function checkMonthlyConstraint(targetMonth, confirmedRows, businessDayRows, config) {
  const cap = Number(config.capacity);
  const limit = Number(config.monthly_rate);
  const r = _monthlyRate(targetMonth, confirmedRows, businessDayRows, cap);

  if (r.rate > limit) {
    return {
      ok: false, level: 'ng',
      reason: `${targetMonth} の月間利用率 ${(r.rate * 100).toFixed(1)}% が上限 ${(limit * 100).toFixed(0)}% を超過`,
      detail: { ...r, limit },
    };
  }
  return { ok: true, level: 'ok', detail: { ...r, limit } };
}

/**
 * 利用者月内上限チェック
 * @param {number} userId
 * @param {string} targetMonth 'YYYY-MM'
 * @param {Array} confirmedRows ShiftConfirmed の全行
 * @param {object} config
 */
function checkUserMonthlyLimit(userId, targetMonth, confirmedRows, config) {
  const offDays = Number(config.monthly_off_days);
  const daysInMonth = _daysInMonth(targetMonth);
  const limit = daysInMonth - offDays;

  const userMonth = confirmedRows.filter(r =>
    Number(r.user_id) === Number(userId) && String(r.date).startsWith(targetMonth)
  );
  const count = userMonth.length;

  if (count > limit) {
    return {
      ok: false, level: 'ng',
      reason: `利用者 ${userId} の ${targetMonth} 利用が上限 ${limit} 日を超過（現在 ${count} 日）`,
      detail: { userId, month: targetMonth, count, limit, daysInMonth, offDays },
    };
  }
  return { ok: true, level: 'ok', detail: { userId, month: targetMonth, count, limit } };
}

// ===== 内部ヘルパー =====

function _monthlyRate(month, confirmedRows, businessDayRows, capacity) {
  const monthRows = confirmedRows.filter(r =>
    String(r.date).startsWith(month) &&
    String(r.is_facility_external).toUpperCase() !== 'TRUE'
  );
  const openDays = businessDayRows.filter(b =>
    String(b.date).startsWith(month) &&
    String(b.is_open).toUpperCase() === 'TRUE'
  ).length;
  const denom = openDays * capacity;
  const rate = denom === 0 ? 0 : monthRows.length / denom;
  return { month, count: monthRows.length, openDays, capacity, rate };
}

function _daysInMonth(targetMonth) {
  const [y, m] = targetMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// ===== ローカルテスト（GASエディタから直接実行） =====

/**
 * 規定計算3関数の動作検証。
 * 期待値と実測をログ出力。値が食い違う場合は §7 ロジックの回帰の疑いあり。
 */
function testRules() {
  const config = { capacity: 20, daily_rate: 1.5, monthly_rate: 1.25, monthly_off_days: 8 };
  const log = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    Logger.log(`${ok ? '✓' : '✗'} ${label} → ${JSON.stringify(actual)} (期待: ${JSON.stringify(expected)})`);
  };

  Logger.log('=== checkDailyConstraint ===');
  let r = checkDailyConstraint('2026-04-15', _dummyDay(29, '2026-04-15', false), config);
  log('29名(全員施設内)', { ok: r.ok, level: r.level }, { ok: true, level: 'ok' });

  r = checkDailyConstraint('2026-04-15', _dummyDay(30, '2026-04-15', false), config);
  log('30名(全員施設内)', { ok: r.ok, level: r.level }, { ok: false, level: 'ng' });

  const mix = _dummyDay(28, '2026-04-15', false).concat(_dummyDay(2, '2026-04-15', true));
  r = checkDailyConstraint('2026-04-15', mix, config);
  log('30名(うち2名施設外)', { ok: r.ok, level: r.level }, { ok: true, level: 'ok' });

  Logger.log('=== checkUserMonthlyLimit ===');
  // 2026-04 = 30日、上限 = 30 - 8 = 22日（22日まで OK、23日で NG）
  const u22 = [];
  for (let d = 1; d <= 22; d++) u22.push({ user_id: 5, date: `2026-04-${String(d).padStart(2,'0')}` });
  r = checkUserMonthlyLimit(5, '2026-04', u22, config);
  log('user5@22日(=上限)', { ok: r.ok }, { ok: true });

  u22.push({ user_id: 5, date: '2026-04-23' });
  r = checkUserMonthlyLimit(5, '2026-04', u22, config);
  log('user5@23日(=上限超)', { ok: r.ok }, { ok: false });

  Logger.log('=== checkMonthlyConstraint（単月判定）===');
  const bd = [];
  for (let d = 1; d <= 20; d++) bd.push({ date: `2026-04-${String(d).padStart(2,'0')}`, is_open: 'TRUE' });
  // 開所20日 × 定員20 = 月最大400件 = 100%

  let confirmed = _dummyMonth(500, '2026-04', bd);  // 125%
  r = checkMonthlyConstraint('2026-04', confirmed, bd, config);
  log('単月125%(=上限ぴったり)', { ok: r.ok, level: r.level }, { ok: true, level: 'ok' });

  confirmed = _dummyMonth(501, '2026-04', bd);  // 125.25%
  r = checkMonthlyConstraint('2026-04', confirmed, bd, config);
  log('単月125%超(501件)', { ok: r.ok, level: r.level }, { ok: false, level: 'ng' });

  confirmed = _dummyMonth(600, '2026-04', bd);  // 150%
  r = checkMonthlyConstraint('2026-04', confirmed, bd, config);
  log('単月150%', { ok: r.ok, level: r.level }, { ok: false, level: 'ng' });
}

function _dummyDay(count, date, external) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({ user_id: i + 1, date, is_facility_external: external ? 'TRUE' : 'FALSE' });
  }
  return arr;
}

function _dummyMonth(count, month, businessDays) {
  const days = businessDays.filter(b => String(b.date).startsWith(month));
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({ user_id: (i % 20) + 1, date: days[i % days.length].date, is_facility_external: 'FALSE' });
  }
  return arr;
}
