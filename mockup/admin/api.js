/**
 * シフト管理 — 管理者画面 API ラッパ
 *
 * `<script src="../../config.js"></script>` の後に読み込む。
 * 利用者画面の api.js とほぼ同じ構造だが、管理者画面はモバイル前提でないことと、
 * 当面は管理者の認証なしで Sheets を直接叩く前提（フェーズ1）。
 *
 *   - CONFIG.GAS_ENDPOINT がプレースホルダ → モックモード（固定ダミーデータ）
 *   - POST は Content-Type=text/plain で preflight 回避
 */

(function (global) {
  'use strict';

  const PLACEHOLDER = '__YOUR_DEPLOYMENT_ID__';

  function isMockMode() {
    return typeof CONFIG === 'undefined'
      || !CONFIG.GAS_ENDPOINT
      || CONFIG.GAS_ENDPOINT.indexOf(PLACEHOLDER) >= 0;
  }

  async function callGet(action, params) {
    if (isMockMode()) return _mock(action, params);
    const url = new URL(CONFIG.GAS_ENDPOINT);
    url.searchParams.set('action', action);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    });
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    return _parse(res);
  }

  async function callPost(action, payload) {
    if (isMockMode()) return _mock(action, payload);
    const res = await fetch(CONFIG.GAS_ENDPOINT, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
    });
    return _parse(res);
  }

  async function _parse(res) {
    if (!res.ok) throw new Error('ネットワークエラー (HTTP ' + res.status + ')');
    let json;
    try { json = await res.json(); }
    catch (e) { throw new Error('レスポンス解析エラー'); }
    if (!json.ok) {
      const code = json.code ? ' [' + json.code + ']' : '';
      throw new Error((json.error || 'API エラー') + code);
    }
    return json.data != null ? json.data : json;
  }

  // ===== モックデータ =====

  const MOCK_NOTIFICATIONS = [
    { notification_id: 142, user_id: 10001, type: 'シフト確定通知', target_date: '2026-05',
      message: '5月のシフトが確定しました（15日）', is_read: 'TRUE',
      mail_sent_at: '2026-04-27 10:30:12', chatwork_sent_at: '2026-04-27 10:30:13',
      chatwork_message_id: '100001', chatwork_error: '', created_at: '2026-04-27 10:30:12',
      name: '田中 太郎', email: 'tanaka@example.com' },
    { notification_id: 141, user_id: 10002, type: 'シフト確定通知', target_date: '2026-05',
      message: '5月のシフトが確定しました（17日）', is_read: 'FALSE',
      mail_sent_at: '2026-04-27 10:30:08', chatwork_sent_at: '2026-04-27 10:30:09',
      chatwork_message_id: '100002', chatwork_error: '', created_at: '2026-04-27 10:30:08',
      name: '佐藤 次郎', email: 'sato@example.com' },
    { notification_id: 140, user_id: 10006, type: 'シフト確定通知', target_date: '2026-05',
      message: '5月のシフトが確定しました（18日）', is_read: 'FALSE',
      mail_sent_at: '', chatwork_sent_at: '', chatwork_message_id: '', chatwork_error: '',
      created_at: '2026-04-27 10:30:05', name: '渡辺 健太', email: 'watanabe_e7@local' },
    { notification_id: 139, user_id: 10003, type: '空き枠通知', target_date: '2026-04-27',
      message: '4/27 に空きが出ました', is_read: 'FALSE',
      mail_sent_at: '', chatwork_sent_at: '', chatwork_message_id: '', chatwork_error: 'Mailbox full',
      created_at: '2026-04-26 09:15:42', name: '鈴木 三郎', email: 'suzuki@example.com' },
    { notification_id: 138, user_id: 10004, type: '空き枠通知', target_date: '2026-04-27',
      message: '4/27 に空きが出ました', is_read: 'FALSE',
      mail_sent_at: '2026-04-26 09:15:40', chatwork_sent_at: '',
      chatwork_message_id: '', chatwork_error: 'HTTP 429: Rate limit exceeded',
      created_at: '2026-04-26 09:15:40', name: '高橋 花子', email: 'takahashi@example.com' },
    { notification_id: 137, user_id: 10010, type: 'その他', target_date: '',
      message: 'パスワード再設定リンクを送信しました', is_read: 'TRUE',
      mail_sent_at: '2026-04-25 14:20:30', chatwork_sent_at: '2026-04-25 14:20:31',
      chatwork_message_id: '100010', chatwork_error: '', created_at: '2026-04-25 14:20:30',
      name: '加藤 結衣', email: 'kato@example.com' },
    { notification_id: 136, user_id: 10009, type: 'その他', target_date: '',
      message: '5月のシフト希望が未提出です（締切 4/30）', is_read: 'FALSE',
      mail_sent_at: '2026-04-24 11:45:00', chatwork_sent_at: '', chatwork_message_id: '', chatwork_error: '',
      created_at: '2026-04-24 11:45:00', name: '小林 海斗', email: 'kobayashi@example.com' },
    { notification_id: 135, user_id: 10003, type: 'その他', target_date: '',
      message: '5月のシフト希望が未提出です（締切 4/30）', is_read: 'FALSE',
      mail_sent_at: '2026-04-24 11:45:00', chatwork_sent_at: '', chatwork_message_id: '', chatwork_error: '',
      created_at: '2026-04-24 11:45:00', name: '鈴木 三郎', email: 'suzuki@example.com' },
    { notification_id: 134, user_id: 10011, type: 'その他', target_date: '',
      message: '招待メールを送信しました（仮パスワード発行）', is_read: 'FALSE',
      mail_sent_at: '', chatwork_sent_at: '', chatwork_message_id: '', chatwork_error: 'Address not found',
      created_at: '2026-04-22 09:00:15', name: '吉田 翔', email: 'yoshida_invalid@example.com' },
    { notification_id: 133, user_id: 10007, type: 'シフト確定通知', target_date: '2026-05',
      message: '5月のシフトが確定しました（14日）', is_read: 'TRUE',
      mail_sent_at: '2026-04-22 08:00:00', chatwork_sent_at: '2026-04-22 08:00:01',
      chatwork_message_id: '100007', chatwork_error: '', created_at: '2026-04-22 08:00:00',
      name: '山本 直樹', email: 'yamamoto@example.com' },
  ];

  const MOCK_USERS = [
    { user_id: 10001, name: '田中 太郎',   category: '通所',       email: 'tanaka@example.com',    status: '利用中', chatwork_room_id: '111222333' },
    { user_id: 10002, name: '佐藤 次郎',   category: '通所',       email: 'sato@example.com',      status: '利用中', chatwork_room_id: '444555666' },
    { user_id: 10003, name: '鈴木 三郎',   category: '在宅',       email: 'suzuki@example.com',    status: '利用中', chatwork_room_id: '' },
    { user_id: 10004, name: '高橋 花子',   category: '通所',       email: 'takahashi@example.com', status: '利用中', chatwork_room_id: '777888999' },
    { user_id: 10005, name: '伊藤 美咲',   category: '在宅(関東)', email: 'ito@example.com',       status: '利用中', chatwork_room_id: '101010101' },
    { user_id: 10006, name: '渡辺 健太',   category: '通所',       email: 'watanabe_e7@local',     status: '利用中', chatwork_room_id: '' },
    { user_id: 10007, name: '山本 直樹',   category: '在宅通所',   email: 'yamamoto@example.com',  status: '利用中', chatwork_room_id: '202020202' },
    { user_id: 10008, name: '中村 さくら', category: '通所',       email: 'nakamura@example.com',  status: '利用中', chatwork_room_id: '303030303' },
    { user_id: 10009, name: '小林 海斗',   category: '通所',       email: 'kobayashi@example.com', status: '利用中', chatwork_room_id: '' },
    { user_id: 10010, name: '加藤 結衣',   category: '在宅',       email: 'kato@example.com',      status: '利用中', chatwork_room_id: '404040404' },
    { user_id: 10011, name: '吉田 翔',     category: '通所',       email: 'yoshida@example.com',   status: '停止',   chatwork_room_id: '' },
  ];

  function _mock(action, args) {
    console.info('[ShiftAdminAPI mock]', action, args);
    args = args || {};
    switch (action) {
      case 'config.list':
        return Promise.resolve({
          capacity: 20, daily_rate: 1.5, monthly_rate: 1.25,
          monthly_off_days: 8, submission_deadline_days_before: 15,
        });
      case 'users.list': {
        const status = args.status;
        const list = status ? MOCK_USERS.filter(u => u.status === status) : MOCK_USERS;
        return Promise.resolve(list);
      }
      case 'users.invite':
        return Promise.resolve({
          user: { user_id: 99999, name: args.name, category: args.category, email: args.email, status: '利用中', chatwork_room_id: '' },
        });
      case 'users.update': {
        const u = MOCK_USERS.find(x => x.user_id === Number(args.user_id));
        if (u) {
          if (args.category        != null) u.category         = args.category;
          if (args.chatwork_room_id != null) u.chatwork_room_id = String(args.chatwork_room_id);
          if (args.status          != null) u.status           = args.status;
        }
        return Promise.resolve(u || {});
      }
      case 'users.updateChatworkRoomId': {
        const u = MOCK_USERS.find(x => x.user_id === Number(args.user_id));
        if (u) u.chatwork_room_id = String(args.chatwork_room_id || '');
        return Promise.resolve({ updated: true });
      }
      case 'shiftRequests.list': {
        // adjust.html の dummyState と同じシードで per-day データを生成（画面との一貫性）
        const month = args.month || '2026-05';
        const [ry, rm] = month.split('-').map(Number);
        const days = new Date(ry, rm, 0).getDate();
        const monthSeed = ry * 12 + rm;
        const closedDays = new Set();
        for (let d = 1; d <= days; d++) {
          if (new Date(ry, rm - 1, d).getDay() === 0) closedDays.add(d);
        }
        if (ry === 2026 && rm === 5) [3, 4, 5, 6].forEach(d => closedDays.add(d));
        if (rm === 1) [1, 2, 3, 12].forEach(d => closedDays.add(d));

        const rows = [];
        MOCK_USERS.filter(u => u.status === '利用中').forEach(u => {
          for (let d = 1; d <= days; d++) {
            if (closedDays.has(d)) continue;
            const seed = (u.user_id * 31 + d * 7 + monthSeed * 13) % 17;
            if (seed < 4) continue;
            let status;
            if (seed < 6)       status = '不承認';
            else if (seed < 9)  status = '提出済';
            else                status = '承認';
            let shift_type, preferred_time = '';
            if (u.category === '在宅通所' && d === Math.ceil(days / 3)) {
              shift_type = '月一通所';
              preferred_time = '午前';
            } else if (['在宅', '在宅(関東)', '在宅通所'].includes(u.category)) {
              shift_type = '在宅';
            } else {
              shift_type = '通所';
            }
            rows.push({
              request_id: rows.length + 1,
              user_id:    u.user_id,
              date:       ry + '-' + String(rm).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
              status,
              shift_type,
              preferred_time,
            });
          }
        });
        return Promise.resolve(rows);
      }
      case 'shiftRequests.create': {
        const entries = (args && args.entries) || [];
        return Promise.resolve({ created: entries.length, skipped: 0 });
      }
      case 'shiftConfirmed.list': {
        const month = (args && args.month) || '2026-05';
        const [ry, rm] = month.split('-').map(Number);
        const days = new Date(ry, rm, 0).getDate();
        const closedDays = new Set();
        for (let d = 1; d <= days; d++) {
          if (new Date(ry, rm - 1, d).getDay() === 0) closedDays.add(d);
        }
        if (ry === 2026 && rm === 5) [3, 4, 5, 6].forEach(d => closedDays.add(d));
        const rows = [];
        MOCK_USERS.filter(u => u.status === '利用中').forEach(u => {
          for (let d = 1; d <= days; d++) {
            if (closedDays.has(d)) continue;
            const seed = (u.user_id * 31 + d * 7) % 13;
            if (seed < 8) {
              rows.push({
                confirmed_id:         rows.length + 1,
                user_id:              u.user_id,
                date:                 ry + '-' + String(rm).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
                is_facility_external: 'FALSE',
                source:               '通常確定',
              });
            }
          }
        });
        return Promise.resolve(rows);
      }
      case 'attendances.list': {
        const month = (args && args.month) || '';
        const date  = (args && args.date)  || '';
        if (!month && !date) return Promise.resolve([]);
        const filterDate = date || null;
        const filterMonth = month || null;
        const rows = [];
        MOCK_USERS.filter(u => u.status === '利用中').slice(0, 8).forEach((u, i) => {
          const targetDate = filterDate || (filterMonth + '-15');
          const seed = (u.user_id + i) % 4;
          let status, clock_in = '', clock_out = '';
          if (seed === 0) { status = '出勤';   clock_in = '09:05'; clock_out = '13:30'; }
          else if (seed === 1) { status = '出勤';   clock_in = '08:55'; }
          else if (seed === 2) { status = '欠勤'; }
          else { status = '未確定'; }
          rows.push({
            attendance_id: rows.length + 1,
            user_id:       u.user_id,
            date:          targetDate,
            status, clock_in, clock_out,
            source:        seed === 3 ? '' : 'admin_record',
          });
        });
        return Promise.resolve(rows);
      }
      case 'businessDays.list': {
        const month = (args && args.month) || '';
        if (!month) return Promise.resolve([]);
        const [ry, rm] = month.split('-').map(Number);
        const days = new Date(ry, rm, 0).getDate();
        const dowJp = ['日', '月', '火', '水', '木', '金', '土'];
        const rows = [];
        for (let d = 1; d <= days; d++) {
          const dt = new Date(ry, rm - 1, d);
          const dateStr = ry + '-' + String(rm).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          rows.push({
            date:        dateStr,
            is_open:     dt.getDay() === 0 ? 'FALSE' : 'TRUE',
            day_of_week: dowJp[dt.getDay()],
            note:        dt.getDay() === 0 ? '日曜' : '',
          });
        }
        return Promise.resolve(rows);
      }
      case 'businessDays.update': {
        const records = (args && args.records) || [];
        return Promise.resolve({ updated: records.length, added: 0 });
      }
      case 'attendances.create': {
        const records = (args && args.records) || [];
        return Promise.resolve({ created: records, updated: [] });
      }
      case 'attendances.delete':
        return Promise.resolve({ deleted: 1 });
      case 'shiftConfirmed.create': {
        const records = (args && args.records) || [];
        return Promise.resolve({ created: records.length, skipped: 0, notifications_sent: records.length });
      }
      case 'exports.spreadsheet': {
        const ym = (args && args.year_month) || '2026-05';
        return Promise.resolve({
          spreadsheet_id: 'mock_ss_' + ym.replace('-', ''),
          url:            'https://docs.google.com/spreadsheets/d/mock_' + ym.replace('-', '') + '/edit',
          generated_at:   new Date().toISOString().replace('T', ' ').slice(0, 19),
        });
      }
      case 'notifications.listAll':
        return Promise.resolve(MOCK_NOTIFICATIONS);
      default:
        return Promise.reject(new Error('mock 未対応 action: ' + action));
    }
  }

  // ===== 高水準ラッパ =====

  global.ShiftAdminAPI = {
    isMockMode,

    // 設定
    getConfig: () => callGet('config.list'),

    // 利用者
    listUsers:               (status)                    => callGet('users.list', status ? { status } : null),
    inviteUser:              (payload)                   => callPost('users.invite', payload),
    updateUser:              (payload)                   => callPost('users.update', payload),
    updateChatworkRoomId:    (user_id, chatwork_room_id) => callPost('users.updateChatworkRoomId', { user_id, chatwork_room_id }),

    // シフト希望（管理者は全件 or 月単位 / 代理入力）
    listShiftRequests:        (params)           => callGet('shiftRequests.list', params || {}),
    proxySubmitShiftRequests: (user_id, entries) => callPost('shiftRequests.create', { user_id, entries }),

    // シフト確定
    confirmShifts:        (payload) => callPost('shiftConfirmed.create', payload),
    listShiftConfirmed:   (params)  => callGet('shiftConfirmed.list', params || {}),

    // 出退勤
    listAttendances:      (params)         => callGet('attendances.list', params || {}),
    recordAttendance:     (records)        => callPost('attendances.create', { records }),
    deleteAttendance:     (user_id, date)  => callPost('attendances.delete', { user_id, date }),

    // 営業日カレンダー
    listBusinessDays:     (month)   => callGet('businessDays.list', month ? { month } : {}),
    updateBusinessDays:   (records) => callPost('businessDays.update', { records }),

    // エクスポート
    exportSpreadsheet: (year_month)   => callPost('exports.spreadsheet', { year_month }),

    // 通知一覧（管理者用: 全ユーザー）
    listNotifications: (params) => callGet('notifications.listAll', params || {}),

    // UI ヘルパ
    busyButton(btn, label) {
      if (!btn) return () => {};
      const prev = btn.textContent, prevDis = btn.disabled;
      btn.textContent = label || '送信中…';
      btn.disabled = true;
      return () => { btn.textContent = prev; btn.disabled = prevDis; };
    },
  };
})(window);
