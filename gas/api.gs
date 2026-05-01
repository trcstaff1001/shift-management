/**
 * Web API ディスパッチャ v1.1
 *
 * リクエスト形式:
 *   GET  ?action=<name>&<params>
 *   POST { action: '<name>', payload: {...} }
 *
 * レスポンス形式:
 *   { ok: true, data: ... }
 *   { ok: false, error: 'メッセージ', code: 'ERROR_CODE' }
 *
 * デプロイ:
 *   GASエディタ → デプロイ → 新しいデプロイ → ウェブアプリ
 *   実行ユーザー: 自分 / アクセス: 全員（または「Googleアカウントを持つ全員」）
 *   発行された URL を work/config.js の GAS_ENDPOINT に記入。
 *
 * v1.1 追加ルート:
 *   attendances.clockIn / clockOut — 利用者の出退勤打刻
 *   notifications.list / unreadCount / markRead — お知らせバッジ
 *   exports.spreadsheet — 色付きスプレッドシート自動生成
 *   users.updateChatworkRoomId — ChatWork ルームID 登録
 *   shiftRequests.delete — 希望取り消し
 *   shiftConfirmed.list — 確定一覧（GET）
 *   attendances.list — 出欠一覧（GET）
 */

// ===== ルーティング =====

const ROUTES = {
  // GET 系
  'config.list':                   handleConfigList,
  'users.list':                    handleUsersList,
  'users.me':                      handleUsersMe,
  'shiftRequests.list':            handleShiftRequestsList,
  'shiftConfirmed.list':           handleShiftConfirmedList,
  'attendances.list':              handleAttendancesList,
  'notifications.list':            handleNotificationsList,
  'notifications.listAll':         handleNotificationsListAll,
  'notifications.unreadCount':     handleNotificationsUnreadCount,

  // POST 系
  'auth.login':                    handleAuthLogin,
  'auth.changePassword':           handleAuthChangePassword,
  'shiftRequests.create':          handleShiftRequestsCreate,
  'shiftRequests.delete':          handleShiftRequestsDelete,
  'shiftConfirmed.create':         handleShiftConfirmedCreate,
  'attendances.create':            handleAttendancesCreate,
  'attendances.clockIn':           handleAttendancesClockIn,
  'attendances.clockOut':          handleAttendancesClockOut,
  'notifications.markRead':        handleNotificationsMarkRead,
  'exports.spreadsheet':           handleExportsSpreadsheet,
  'users.invite':                  handleUsersInvite,
  'users.update':                  handleUsersUpdate,
  'users.updateChatworkRoomId':    handleUsersUpdateChatworkRoomId,
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
    Logger.log('EXCEPTION in ' + action + ': ' + err.message + '\n' + err.stack);
    return errorResponse(err.message || String(err), 'EXCEPTION');
  }
}

// ===== GET ハンドラ =====

/** GET ?action=config.list */
function handleConfigList() {
  return jsonResponse({ data: getConfig() });
}

/** GET ?action=users.me&user_id=1 — 利用者が自分のプロフィールを取得（セッション更新用） */
function handleUsersMe(params) {
  const userId = Number(params.user_id);
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');
  const user = readTable('Users').find(u => Number(u.user_id) === userId);
  if (!user) return errorResponse('ユーザーが見つかりません', 'USER_NOT_FOUND');
  return jsonResponse({ data: _stripPassword(user) });
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
  const month  = params.month || null;
  let rows = readTable('ShiftRequests');
  if (userId != null) rows = rows.filter(r => Number(r.user_id) === userId);
  if (month)          rows = rows.filter(r => String(r.date).startsWith(month));
  return jsonResponse({ data: rows });
}

/** GET ?action=shiftConfirmed.list&month=2026-05[&user_id=1] */
function handleShiftConfirmedList(params) {
  const month  = params.month  || null;
  const userId = params.user_id ? Number(params.user_id) : null;
  let rows = readTable('ShiftConfirmed');
  if (month)          rows = rows.filter(r => String(r.date).startsWith(month));
  if (userId != null) rows = rows.filter(r => Number(r.user_id) === userId);
  return jsonResponse({ data: rows });
}

/** GET ?action=attendances.list&month=2026-05[&user_id=1] */
function handleAttendancesList(params) {
  const month  = params.month  || null;
  const userId = params.user_id ? Number(params.user_id) : null;
  let rows = readTable('Attendances');
  if (month)          rows = rows.filter(r => String(r.date).startsWith(month));
  if (userId != null) rows = rows.filter(r => Number(r.user_id) === userId);
  return jsonResponse({ data: rows });
}

/**
 * GET ?action=notifications.listAll[&limit=100]
 * 管理者用: 全ユーザーの通知を created_at 降順で返す。Users テーブルを JOIN して name/email を付与。
 */
function handleNotificationsListAll(params) {
  const limit = params.limit ? Number(params.limit) : 100;
  let rows = readTable('Notifications')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (limit > 0) rows = rows.slice(0, limit);

  const userMap = {};
  readTable('Users').forEach(u => { userMap[String(u.user_id)] = u; });

  const enriched = rows.map(n => {
    const u = userMap[String(n.user_id)] || {};
    return Object.assign({}, n, { name: u.name || '—', email: u.email || '—' });
  });
  return jsonResponse({ data: enriched });
}

/**
 * GET ?action=notifications.list&user_id=1[&limit=20]
 * created_at 降順で返す。
 */
function handleNotificationsList(params) {
  const userId = params.user_id ? Number(params.user_id) : null;
  const limit  = params.limit  ? Number(params.limit)  : 50;
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');
  let rows = readTable('Notifications')
    .filter(r => Number(r.user_id) === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (limit > 0) rows = rows.slice(0, limit);
  return jsonResponse({ data: rows });
}

/** GET ?action=notifications.unreadCount&user_id=1 */
function handleNotificationsUnreadCount(params) {
  const userId = params.user_id ? Number(params.user_id) : null;
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');
  const count = readTable('Notifications')
    .filter(r => Number(r.user_id) === userId && String(r.is_read).toUpperCase() !== 'TRUE')
    .length;
  return jsonResponse({ data: { count } });
}

// ===== POST ハンドラ =====

/**
 * POST auth.login
 *   payload: { user_id, password }
 */
function handleAuthLogin(params, payload) {
  const userId   = Number(payload.user_id);
  const password = String(payload.password || '');
  const user = readTable('Users').find(u => Number(u.user_id) === userId);
  if (!user)                         return errorResponse('ユーザーが存在しません', 'USER_NOT_FOUND');
  if (user.status !== '利用中')      return errorResponse('停止/退所中のアカウントです', 'USER_INACTIVE');
  if (!verifyPassword(password, user.password_hash)) {
    return errorResponse('パスワードが違います', 'AUTH_FAILED');
  }
  // 初回ログイン時刻を記録（未設定の場合のみ）
  if (!user.activated_at) {
    updateRow('Users', row => Number(row.user_id) === userId, { activated_at: nowJst() });
  }
  return jsonResponse({ data: { user: _stripPassword(user) } });
}

/**
 * POST auth.changePassword
 *   payload: { user_id, current_password, new_password }
 */
function handleAuthChangePassword(params, payload) {
  const userId   = Number(payload.user_id);
  const curPw    = String(payload.current_password || '');
  const newPw    = String(payload.new_password     || '');
  if (!userId || !curPw || !newPw) return errorResponse('user_id / current_password / new_password 必須', 'BAD_PAYLOAD');
  if (newPw.length < 6) return errorResponse('新しいパスワードは6文字以上にしてください', 'INVALID_PASSWORD');
  const user = readTable('Users').find(u => Number(u.user_id) === userId);
  if (!user) return errorResponse('ユーザーが見つかりません', 'USER_NOT_FOUND');
  if (!verifyPassword(curPw, user.password_hash)) return errorResponse('現在のパスワードが違います', 'AUTH_FAILED');
  updateRow('Users', r => Number(r.user_id) === userId, { password_hash: hashPassword(newPw) });
  return jsonResponse({ data: { updated: true } });
}

/**
 * POST shiftRequests.create
 *   payload: { user_id, entries: [{ date, shift_type, preferred_time? }] }
 *   後方互換: entries がなく dates がある場合は dates を通所として扱う。
 *   重複はスキップ。規定超過は希望段階ではブロックしない（確定時に管理者が調整）。
 */
function handleShiftRequestsCreate(params, payload) {
  const userId = Number(payload.user_id);
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');

  // entries 形式 or 旧 dates 形式どちらも受け付ける
  let entries;
  if (Array.isArray(payload.entries)) {
    entries = payload.entries;
  } else if (Array.isArray(payload.dates)) {
    entries = payload.dates.map(d => ({ date: d, shift_type: '通所', preferred_time: '' }));
  } else {
    return errorResponse('entries または dates 必須', 'BAD_PAYLOAD');
  }
  if (entries.length === 0) return errorResponse('entries が空です', 'BAD_PAYLOAD');

  const dates = entries.map(e => String(e.date));
  const existing     = readTable('ShiftRequests').filter(r =>
    Number(r.user_id) === userId && dates.includes(String(r.date))
  );
  const existingDates = new Set(existing.map(r => String(r.date)));
  const toCreate      = entries.filter(e => !existingDates.has(String(e.date)));

  const created = toCreate.map(e => appendRow('ShiftRequests', {
    user_id:        userId,
    date:           e.date,
    shift_type:     e.shift_type     || '通所',
    preferred_time: e.preferred_time || '',
    status:         '提出済',
    submitted_at:   nowJst(),
  }));

  return jsonResponse({ data: { created: created.length, skipped: Array.from(existingDates) } });
}

/**
 * POST shiftRequests.delete
 *   payload: { user_id, dates: ['YYYY-MM-DD', ...] }
 *   締切後は管理者のみ可（フェーズ1では簡易的にstatusをキャンセルに変更）。
 */
function handleShiftRequestsDelete(params, payload) {
  const userId = Number(payload.user_id);
  const dates  = Array.isArray(payload.dates) ? payload.dates : [];
  if (!userId || dates.length === 0) return errorResponse('user_id と dates 必須', 'BAD_PAYLOAD');

  const cancelled = [];
  dates.forEach(d => {
    const updated = updateRow('ShiftRequests',
      row => Number(row.user_id) === userId && String(row.date) === d && row.status !== 'キャンセル',
      { status: 'キャンセル' }
    );
    if (updated) cancelled.push({ user_id: userId, date: d });
  });

  return jsonResponse({ data: { cancelled } });
}

/**
 * POST shiftConfirmed.create
 *   payload: { records: [{ user_id, date, is_facility_external?, source?, confirmed_by? }] }
 *   - 全件 atomic: 1件でも規定NGなら全件reject
 *   - 確定後: 利用者に通知配信（ChatWork + メール + アプリ内バッジ）
 *   - 戻り: { created, skipped, notifications: { sent, failed, skipped } }
 */
function handleShiftConfirmedCreate(params, payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length === 0) return errorResponse('records 必須', 'BAD_PAYLOAD');

  const config       = getConfig();
  const existing     = readTable('ShiftConfirmed');
  const businessDays = readTable('BusinessDays');

  const existingKeys = new Set(existing.map(r => r.user_id + '_' + r.date));
  const skipped      = [];
  const newRecords   = [];

  records.forEach(r => {
    const key = r.user_id + '_' + r.date;
    if (existingKeys.has(key)) {
      skipped.push({ user_id: r.user_id, date: r.date, reason: '既に確定済み' });
    } else {
      newRecords.push({
        user_id:              Number(r.user_id),
        date:                 String(r.date),
        is_facility_external: r.is_facility_external ? 'TRUE' : 'FALSE',
        source:               r.source || '通常確定',
        confirmed_by:         r.confirmed_by ? Number(r.confirmed_by) : '',
      });
    }
  });

  if (newRecords.length === 0) return jsonResponse({ data: { created: [], skipped } });

  // 規定検証
  const merged = existing.concat(newRecords);

  const affectedDates = [...new Set(newRecords.map(r => r.date))];
  for (const date of affectedDates) {
    const result = checkDailyConstraint(date, merged, config);
    if (!result.ok) return errorResponse(result.reason, 'RULE_DAILY');
  }

  const userMonthPairs = new Set();
  newRecords.forEach(r => userMonthPairs.add(r.user_id + '|' + r.date.substring(0, 7)));
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

  // 一括書き込み
  const created = newRecords.map(r => appendRow('ShiftConfirmed', {
    ...r, confirmed_at: nowJst(),
  }));

  // 通知配信（確定した利用者ごとに1件のNotificationを作成→ChatWork + メール）
  const notificationResult = _dispatchConfirmedNotifications(created, payload.year_month);

  return jsonResponse({ data: { created, skipped, notifications: notificationResult } });
}

/**
 * POST attendances.create（管理者用：出勤/欠勤の管理者記録・修正）
 *   payload: { records: [{ user_id, date, status, recorded_by, note? }] }
 *   source は 'admin_record' または 'admin_override' を自動判定。
 */
function handleAttendancesCreate(params, payload) {
  const records      = Array.isArray(payload.records) ? payload.records : [];
  if (records.length === 0) return errorResponse('records 必須', 'BAD_PAYLOAD');
  const validStatus  = ['出勤', '欠勤'];

  const created = [];
  const updated = [];

  for (const r of records) {
    const userId     = Number(r.user_id);
    const date       = String(r.date);
    const status     = String(r.status || '');
    const recordedBy = r.recorded_by ? Number(r.recorded_by) : null;

    if (!userId || !date || !validStatus.includes(status)) {
      return errorResponse('user_id / date / status 必須（statusは出勤|欠勤）', 'BAD_PAYLOAD');
    }

    const existing = readTable('Attendances')
      .find(row => Number(row.user_id) === userId && String(row.date) === date);

    const source = existing ? 'admin_override' : 'admin_record';
    const patch  = {
      status,
      source,
      note:        r.note || '',
      recorded_by: recordedBy || '',
      recorded_at: nowJst(),
    };

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
 * POST attendances.clockIn（利用者の出勤打刻）
 *   payload: { user_id, date?: 'YYYY-MM-DD' }  ← date 省略時は JST 今日
 *   - 当日に確定シフトがない場合はエラー
 *   - 既に clock_in 済みの場合は「打刻済み」エラー
 */
function handleAttendancesClockIn(params, payload) {
  const userId = Number(payload.user_id);
  const date   = String(payload.date || todayJst());
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');

  // 当日の確定シフト確認
  const confirmed = readTable('ShiftConfirmed')
    .find(r => Number(r.user_id) === userId && String(r.date) === date);
  if (!confirmed) {
    return errorResponse(date + ' に確定シフトがありません（打刻不可）', 'NO_CONFIRMED_SHIFT');
  }

  const now = nowJst();
  const existing = readTable('Attendances')
    .find(r => Number(r.user_id) === userId && String(r.date) === date);

  if (existing && existing.clock_in) {
    return errorResponse('出勤打刻済みです: ' + existing.clock_in, 'ALREADY_CLOCKED_IN');
  }

  if (existing) {
    const updated = updateRow('Attendances',
      r => Number(r.user_id) === userId && String(r.date) === date,
      { clock_in: now, status: '未確定', source: 'self_clock', recorded_at: now }
    );
    return jsonResponse({ data: { clock_in: now, attendance: updated } });
  } else {
    const created = appendRow('Attendances', {
      user_id: userId, date,
      status: '未確定', clock_in: now, source: 'self_clock', recorded_at: now,
    });
    return jsonResponse({ data: { clock_in: now, attendance: created } });
  }
}

/**
 * POST attendances.clockOut（利用者の退勤打刻）
 *   payload: { user_id, date?: 'YYYY-MM-DD' }
 *   - clock_in 済みであることが前提
 *   - clock_out 後に status を '出勤' に確定
 */
function handleAttendancesClockOut(params, payload) {
  const userId = Number(payload.user_id);
  const date   = String(payload.date || todayJst());
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');

  const existing = readTable('Attendances')
    .find(r => Number(r.user_id) === userId && String(r.date) === date);

  if (!existing || !existing.clock_in) {
    return errorResponse('出勤打刻がありません（先に出勤打刻してください）', 'NOT_CLOCKED_IN');
  }
  if (existing.clock_out) {
    return errorResponse('退勤打刻済みです: ' + existing.clock_out, 'ALREADY_CLOCKED_OUT');
  }

  const now = nowJst();
  const updated = updateRow('Attendances',
    r => Number(r.user_id) === userId && String(r.date) === date,
    { clock_out: now, status: '出勤', source: 'self_clock', recorded_at: now }
  );
  return jsonResponse({ data: { clock_out: now, attendance: updated } });
}

/**
 * POST notifications.markRead
 *   payload: { user_id, notification_ids?: [1,2,3] }
 *   notification_ids 省略 → 当該ユーザーの全未読を既読化。
 */
function handleNotificationsMarkRead(params, payload) {
  const userId = Number(payload.user_id);
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');
  const ids = Array.isArray(payload.notification_ids) ? payload.notification_ids.map(Number) : null;

  const rows = readTable('Notifications').filter(r => {
    if (Number(r.user_id) !== userId) return false;
    if (String(r.is_read).toUpperCase() === 'TRUE') return false;
    if (ids) return ids.includes(Number(r.notification_id));
    return true;
  });

  let count = 0;
  rows.forEach(r => {
    const ok = updateRow('Notifications',
      row => Number(row.notification_id) === Number(r.notification_id),
      { is_read: 'TRUE' }
    );
    if (ok) count++;
  });

  return jsonResponse({ data: { marked_count: count } });
}

/**
 * POST exports.spreadsheet
 *   payload: { year_month: 'YYYY-MM', confirmed_by?: <admin_id> }
 *   → exportShiftSpreadsheet() を呼び出し、URL を返す。
 */
function handleExportsSpreadsheet(params, payload) {
  const yearMonth  = String(payload.year_month || '');
  const confirmedBy = payload.confirmed_by ? Number(payload.confirmed_by) : null;
  if (!yearMonth) return errorResponse('year_month 必須', 'BAD_PAYLOAD');

  const result = exportShiftSpreadsheet(yearMonth, confirmedBy);
  return jsonResponse({ data: result });
}

/**
 * POST users.invite
 *   payload: { name, email, category, chatwork_room_id? }
 *   仮パスワードを発行 → 招待メール送信 → Notifications にログ。
 */
function handleUsersInvite(params, payload) {
  const name             = String(payload.name     || '').trim();
  const email            = String(payload.email    || '').trim();
  const category         = String(payload.category || '').trim();
  const chatworkRoomId   = String(payload.chatwork_room_id || '').trim();
  const validCategories  = ['通所', '在宅', '在宅(関東)', '在宅通所'];

  if (!name || !email || !category) return errorResponse('name/email/category 必須', 'BAD_PAYLOAD');
  if (!validCategories.includes(category)) return errorResponse('category 不正: ' + category, 'BAD_PAYLOAD');

  const existing = readTable('Users').find(u => u.email === email);
  if (existing) return errorResponse('メールアドレス重複: ' + email, 'EMAIL_DUPLICATE');

  const tempPassword = _generateTempPassword(10);
  const user = appendRow('Users', {
    name, email, category,
    password_hash:     hashPassword(tempPassword),
    status:            '利用中',
    chatwork_room_id:  chatworkRoomId,
    invited_at:        nowJst(),
  });

  let mailSent = false;
  if (!email.endsWith('@local')) {
    try {
      MailApp.sendEmail({
        to: email,
        name: 'シフト管理システム',
        subject: '【シフト管理システム】利用者招待',
        body: [
          name + ' 様',
          '',
          'シフト管理システムへの利用者登録が完了しました。',
          '以下の情報でログインしてください。',
          '',
          '利用者ID: ' + user.user_id,
          '仮パスワード: ' + tempPassword,
          '',
          '※初回ログイン後、必ずパスワードを変更してください。',
        ].join('\n'),
      });
      mailSent = true;
    } catch (err) {
      Logger.log('招待メール送信失敗: ' + err.message);
    }
  }

  const notif = appendRow('Notifications', {
    user_id: user.user_id,
    type: 'その他',
    message: '招待送信（' + (mailSent ? 'メール送信済' : 'メール送信スキップ（@localまたは送信失敗）') + '）',
    is_read: 'FALSE',
    mail_sent_at: mailSent ? nowJst() : '',
  });

  return jsonResponse({
    data: {
      user:          _stripPassword(user),
      temp_password: tempPassword,
      mail_sent:     mailSent,
    },
  });
}

/**
/**
 * POST users.update（管理者用: カテゴリ・ChatWork ルームID・ステータスを更新）
 *   payload: { user_id, category?, chatwork_room_id?, status? }
 */
function handleUsersUpdate(params, payload) {
  const userId         = Number(payload.user_id);
  const validCategories = ['通所', '在宅', '在宅(関東)', '在宅通所'];
  const validStatuses   = ['利用中', '停止', '退所'];
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');

  const patch = {};
  if (payload.category != null) {
    if (!validCategories.includes(payload.category))
      return errorResponse('category 不正: ' + payload.category, 'BAD_PAYLOAD');
    patch.category = payload.category;
  }
  if (payload.chatwork_room_id != null) patch.chatwork_room_id = String(payload.chatwork_room_id).trim();
  if (payload.status != null) {
    if (!validStatuses.includes(payload.status))
      return errorResponse('status 不正: ' + payload.status, 'BAD_PAYLOAD');
    patch.status = payload.status;
  }
  if (Object.keys(patch).length === 0) return errorResponse('更新フィールドがありません', 'BAD_PAYLOAD');

  const updated = updateRow('Users', r => Number(r.user_id) === userId, patch);
  if (!updated) return errorResponse('user_id ' + userId + ' が見つかりません', 'USER_NOT_FOUND');
  return jsonResponse({ data: _stripPassword(updated) });
}

/**
 * POST users.updateChatworkRoomId（管理者用: ChatWork ルームID を登録・更新）
 *   payload: { user_id, chatwork_room_id }
 */
function handleUsersUpdateChatworkRoomId(params, payload) {
  const userId       = Number(payload.user_id);
  const chatworkRoomId = String(payload.chatwork_room_id || '').trim();
  if (!userId) return errorResponse('user_id 必須', 'BAD_PAYLOAD');

  const updated = updateRow('Users',
    r => Number(r.user_id) === userId,
    { chatwork_room_id: chatworkRoomId }
  );
  if (!updated) return errorResponse('user_id ' + userId + ' が見つかりません', 'USER_NOT_FOUND');

  return jsonResponse({ data: { user_id: userId, chatwork_room_id: chatworkRoomId } });
}

// ===== 内部: 通知配信 =====

/**
 * 確定後の利用者通知配信（ChatWork + メール + Notifications レコード生成）。
 * 利用者ごとに当月の確定件数を集計してメッセージに含める。
 * @param {Array} createdRecords 今回 appendRow で作成された ShiftConfirmed 行
 * @param {string} [yearMonth] 対象月 'YYYY-MM'（省略時は records から推定）
 */
function _dispatchConfirmedNotifications(createdRecords, yearMonth) {
  if (createdRecords.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const ym = yearMonth || createdRecords[0].date.substring(0, 7);
  const users = readTable('Users');

  // 利用者ごとの当月確定件数（今回分を含む全確定から集計）
  const allConfirmed = readTable('ShiftConfirmed').filter(r => String(r.date).startsWith(ym));
  const countByUser  = {};
  allConfirmed.forEach(r => {
    const uid = Number(r.user_id);
    countByUser[uid] = (countByUser[uid] || 0) + 1;
  });

  // 通知対象ユーザーIDの重複排除
  const targetUserIds = [...new Set(createdRecords.map(r => Number(r.user_id)))];

  const notifications = [];
  targetUserIds.forEach(uid => {
    const user = users.find(u => Number(u.user_id) === uid);
    if (!user) return;

    const confirmedCount = countByUser[uid] || 0;
    const message = ym.replace('-', '年') + '月のシフトが確定しました（通所予定: ' + confirmedCount + '日）';

    // メール送信
    let mailSent = false;
    const email  = String(user.email || '');
    if (email && !email.endsWith('@local')) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: '【シフト管理】' + ym.replace('-', '年') + '月のシフトが確定しました',
          body: [
            user.name + ' 様',
            '',
            ym.replace('-', '年') + '月のシフトが確定しました。',
            '通所予定: ' + confirmedCount + '日',
            '',
            'アプリからご確認ください。',
          ].join('\n'),
        });
        mailSent = true;
      } catch (e) {
        Logger.log('確定通知メール失敗 uid=' + uid + ': ' + e.message);
      }
    }

    const notif = appendRow('Notifications', {
      user_id:     uid,
      type:        'シフト確定通知',
      target_date: ym + '-01',
      message:     message,
      is_read:     'FALSE',
      mail_sent_at: mailSent ? nowJst() : '',
    });
    notifications.push({ ...notif, confirmed_count: confirmedCount, user });
  });

  // ChatWork 配信
  return dispatchChatworkNotifications(notifications, users);
}

// ===== ユーティリティ =====

function _stripPassword(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

function _generateTempPassword(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ===== ローカルテスト（GASエディタから直接実行） =====

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

  Logger.log('--- chatwork dry_run ---');
  const r = sendChatworkMessage('test_room', '[info]smokeTest[/info]');
  Logger.log(JSON.stringify(r));
}

function seedTestUser() {
  const u = appendRow('Users', {
    name:             'テスト太郎',
    email:            'test@local',
    password_hash:    hashPassword('test1234'),
    category:         '通所',
    status:           '利用中',
    chatwork_room_id: '',
  });
  Logger.log('created: ' + JSON.stringify(u));
}
