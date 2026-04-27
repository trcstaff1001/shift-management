/**
 * Web API ディスパッチャ
 *
 * リクエスト形式:
 *   GET  ?action=<name>&<params>
 *   POST { action: '<name>', payload: {...}, auth?: { user_id, password } }
 *
 * レスポンス形式:
 *   { ok: true, data: ... }
 *   { ok: false, error: 'メッセージ', code: 'ERROR_CODE' }
 *
 * デプロイ:
 *   GASエディタ → デプロイ → 新しいデプロイ → ウェブアプリ
 *   実行ユーザー: 自分 / アクセス: 全員（または「Googleアカウントを持つ全員」）
 *   発行された URL を work/config.js の GAS_ENDPOINT に記入。
 */

// ===== ルーティング =====

const ROUTES = {
  // GET 系
  'config.list':          handleConfigList,
  'users.list':           handleUsersList,
  'shiftRequests.list':   handleShiftRequestsList,

  // POST 系
  'auth.login':            handleAuthLogin,
  'shiftRequests.create':  handleShiftRequestsCreate,
  'shiftConfirmed.create': handleShiftConfirmedCreate,
  'attendances.create':    handleAttendancesCreate,
  'users.invite':          handleUsersInvite,
};

function doGet(e) {
  return _dispatch(e.parameter.action, e.parameter, null);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch (err) { return errorResponse('不正なJSON', 'BAD_JSON'); }
  return _dispatch(body.action, body, body.payload || {});
}

function _dispatch(action, params, payload) {
  if (!action || !ROUTES[action]) {
    return errorResponse('不明なaction: ' + action, 'UNKNOWN_ACTION');
  }
  try {
    return ROUTES[action](params, payload);
  } catch (err) {
    return errorResponse(err.message || String(err), 'EXCEPTION');
  }
}

// ===== ハンドラ（参考実装） =====

/** GET ?action=config.list */
function handleConfigList() {
  return jsonResponse({ data: getConfig() });
}

/** GET ?action=users.list[&status=利用中] */
function handleUsersList(params) {
  let users = readTable('Users').map(_stripPassword);
  if (params.status) {
    users = users.filter(u => u.status === params.status);
  }
  return jsonResponse({ data: users });
}

/** GET ?action=shiftRequests.list&user_id=1&month=2026-04 */
function handleShiftRequestsList(params) {
  const userId = params.user_id ? Number(params.user_id) : null;
  const month = params.month || null;
  let rows = readTable('ShiftRequests');
  if (userId != null) rows = rows.filter(r => Number(r.user_id) === userId);
  if (month) rows = rows.filter(r => String(r.date).startsWith(month));
  return jsonResponse({ data: rows });
}

/**
 * POST auth.login
 *   payload: { user_id, password }
 *   戻り: { user: {...} }（成功時。passwordは除外）
 */
function handleAuthLogin(params, payload) {
  const userId = Number(payload.user_id);
  const password = String(payload.password || '');
  const user = readTable('Users').find(u => Number(u.user_id) === userId);
  if (!user) return errorResponse('ユーザーが存在しません', 'USER_NOT_FOUND');
  if (user.status !== '利用中') return errorResponse('停止/退所中のアカウントです', 'USER_INACTIVE');
  if (!verifyPassword(password, user.password_hash)) {
    return errorResponse('パスワードが違います', 'AUTH_FAILED');
  }
  return jsonResponse({ data: { user: _stripPassword(user) } });
}

/**
 * POST shiftRequests.create
 *   payload: { user_id, dates: ['YYYY-MM-DD', ...] }
 *   - 重複（同 user × 同 date）はスキップ
 *   - 規定計算は希望提出時点ではNGにせず、確定時にチェックする方針
 *     （希望は超過していても受け付け、管理者が確定時に調整）
 */
function handleShiftRequestsCreate(params, payload) {
  const userId = Number(payload.user_id);
  const dates = Array.isArray(payload.dates) ? payload.dates : [];
  if (!userId || dates.length === 0) {
    return errorResponse('user_id と dates 必須', 'BAD_PAYLOAD');
  }

  const existing = readTable('ShiftRequests').filter(r =>
    Number(r.user_id) === userId && dates.includes(String(r.date))
  );
  const existingDates = new Set(existing.map(r => String(r.date)));
  const toCreate = dates.filter(d => !existingDates.has(d));

  const created = toCreate.map(d => appendRow('ShiftRequests', {
    user_id: userId,
    date: d,
    status: '提出済',
    submitted_at: nowJst(),
  }));

  return jsonResponse({
    data: { created, skipped: Array.from(existingDates) },
  });
}

/**
 * POST shiftConfirmed.create
 *   payload: {
 *     records: [{ user_id, date, is_facility_external?, source?, confirmed_by? }]
 *   }
 *   - 全件 atomic: 1件でも規定NGなら全件reject（書き込み無し）
 *   - (user_id, date) 重複は skip
 *   - 規定検証: 影響日の1日制約 → user×month の上限 → 影響月の月間制約（単月125%）
 *   - 戻り: { created: [...], skipped: [...] }
 */
function handleShiftConfirmedCreate(params, payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length === 0) return errorResponse('records 必須', 'BAD_PAYLOAD');

  const config = getConfig();
  const existing = readTable('ShiftConfirmed');
  const businessDays = readTable('BusinessDays');

  const existingKeys = new Set(existing.map(r => `${r.user_id}_${r.date}`));
  const skipped = [];
  const newRecords = [];
  records.forEach(r => {
    const key = `${r.user_id}_${r.date}`;
    if (existingKeys.has(key)) {
      skipped.push({ user_id: r.user_id, date: r.date, reason: '既に確定済み' });
    } else {
      newRecords.push({
        user_id: Number(r.user_id),
        date: String(r.date),
        is_facility_external: r.is_facility_external ? 'TRUE' : 'FALSE',
        source: r.source || '通常確定',
        confirmed_by: r.confirmed_by ? Number(r.confirmed_by) : '',
      });
    }
  });

  if (newRecords.length === 0) {
    return jsonResponse({ data: { created: [], skipped } });
  }

  // 規定検証はマージ後のデータで実施（同一リクエスト内の追加分も加算対象に含める）
  const merged = existing.concat(newRecords);

  const affectedDates = [...new Set(newRecords.map(r => r.date))];
  for (const date of affectedDates) {
    const result = checkDailyConstraint(date, merged, config);
    if (!result.ok) return errorResponse(result.reason, 'RULE_DAILY');
  }

  const userMonthPairs = new Set();
  newRecords.forEach(r => userMonthPairs.add(`${r.user_id}|${r.date.substring(0, 7)}`));
  for (const pair of userMonthPairs) {
    const [uid, month] = pair.split('|');
    const result = checkUserMonthlyLimit(Number(uid), month, merged, config);
    if (!result.ok) return errorResponse(result.reason, 'RULE_USER_MONTHLY');
  }

  const affectedMonths = [...new Set(newRecords.map(r => r.date.substring(0, 7)))];
  for (const month of affectedMonths) {
    const result = checkMonthlyConstraint(month, merged, businessDays, config);
    if (!result.ok) return errorResponse(result.reason, 'RULE_MONTHLY');
  }

  // 全件パス → 一括書き込み
  const created = newRecords.map(r => appendRow('ShiftConfirmed', {
    ...r,
    confirmed_at: nowJst(),
  }));

  return jsonResponse({ data: { created, skipped } });
}

/**
 * POST attendances.create
 *   payload: { records: [{ user_id, date, status, recorded_by, note? }] }
 *   - status: '出勤' | '欠勤'
 *   - 既存 (user_id, date) があれば status/note を更新、なければ新規追加
 *   - 戻り: { created: [...], updated: [...] }
 */
function handleAttendancesCreate(params, payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length === 0) return errorResponse('records 必須', 'BAD_PAYLOAD');
  const validStatus = ['出勤', '欠勤'];

  const created = [];
  const updated = [];
  for (const r of records) {
    const userId = Number(r.user_id);
    const date = String(r.date);
    const status = String(r.status || '');
    const recordedBy = Number(r.recorded_by);
    if (!userId || !date || !validStatus.includes(status) || !recordedBy) {
      return errorResponse('records[].user_id/date/status/recorded_by 必須', 'BAD_PAYLOAD');
    }

    const patch = { status, note: r.note || '', recorded_by: recordedBy, recorded_at: nowJst() };
    const updatedRow = updateRow('Attendances',
      row => Number(row.user_id) === userId && String(row.date) === date,
      patch
    );
    if (updatedRow) {
      updated.push(updatedRow);
    } else {
      created.push(appendRow('Attendances', { user_id: userId, date, ...patch }));
    }
  }

  return jsonResponse({ data: { created, updated } });
}

/**
 * POST users.invite
 *   payload: { name, email, category }
 *   - email が `@local` 終端ならメール送信スキップ（ダミーemail運用）
 *   - 仮パスワード10桁を発行 → SHA-256+salt でハッシュ → status='利用中' で登録
 *   - メール送信（成功時 mail_sent_at セット）→ Notifications にログ記録
 *   - 戻り: { user, temp_password, mail_sent }
 *     ※ temp_password はレスポンス1回限りの平文返却。管理者がコピーして利用者に伝達
 */
function handleUsersInvite(params, payload) {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const category = String(payload.category || '').trim();
  const validCategories = ['通所', '在宅', '在宅(関東)', '在宅通所'];
  if (!name || !email || !category) return errorResponse('name/email/category 必須', 'BAD_PAYLOAD');
  if (!validCategories.includes(category)) return errorResponse('category 不正: ' + category, 'BAD_PAYLOAD');

  const existing = readTable('Users').find(u => u.email === email);
  if (existing) return errorResponse('メールアドレス重複: ' + email, 'EMAIL_DUPLICATE');

  const tempPassword = _generateTempPassword(10);
  const user = appendRow('Users', {
    name, email, category,
    password_hash: hashPassword(tempPassword),
    status: '利用中',
    invited_at: nowJst(),
  });

  let mailSent = false;
  if (!email.endsWith('@local')) {
    try {
      MailApp.sendEmail({
        to: email,
        subject: '【シフト管理システム】利用者招待',
        body: [
          `${name} 様`,
          '',
          'シフト管理システムへの利用者登録が完了しました。',
          '以下の情報でログインしてください。',
          '',
          `利用者ID: ${user.user_id}`,
          `仮パスワード: ${tempPassword}`,
          '',
          '※初回ログイン後、必ずパスワードを変更してください。',
        ].join('\n'),
      });
      mailSent = true;
    } catch (err) {
      Logger.log('メール送信失敗: ' + err.message);
    }
  }

  appendRow('Notifications', {
    user_id: user.user_id,
    type: 'その他',
    message: `招待送信（${mailSent ? 'メール送信済' : 'メール送信スキップ（@localまたは送信失敗）'}）`,
    is_read: 'FALSE',
    mail_sent_at: mailSent ? nowJst() : '',
  });

  return jsonResponse({
    data: {
      user: _stripPassword(user),
      temp_password: tempPassword,
      mail_sent: mailSent,
    },
  });
}

// ===== ユーティリティ =====

function _stripPassword(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

// ===== ローカルテスト用（GASエディタから直接実行） =====

/** スモークテスト: setupSheets 実行後に走らせて疎通確認 */
function smokeTest() {
  Logger.log('--- config ---');
  Logger.log(JSON.stringify(getConfig(), null, 2));

  Logger.log('--- users (空のはず) ---');
  Logger.log(JSON.stringify(readTable('Users'), null, 2));

  Logger.log('--- hash/verify テスト ---');
  const h = hashPassword('test1234');
  Logger.log('hash: ' + h);
  Logger.log('verify(correct): ' + verifyPassword('test1234', h));
  Logger.log('verify(wrong):   ' + verifyPassword('xxxx', h));

  Logger.log('--- nowJst / todayJst ---');
  Logger.log(nowJst());
  Logger.log(todayJst());
}

/** ダミーユーザーを1件作成（手動テスト用。本番では使わない） */
function seedTestUser() {
  const u = appendRow('Users', {
    name: 'テスト太郎',
    email: 'test@local',
    password_hash: hashPassword('test1234'),
    category: '通所',
    status: '利用中',
  });
  Logger.log('created: ' + JSON.stringify(u));
}

/** 仮パスワード生成（紛らわしい文字 0/O/1/l/I を除外） */
function _generateTempPassword(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
