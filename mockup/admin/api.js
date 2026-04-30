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
            rows.push({
              request_id: rows.length + 1,
              user_id:    u.user_id,
              date:       ry + '-' + String(rm).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
              status,
            });
          }
        });
        return Promise.resolve(rows);
      }
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
    updateChatworkRoomId:    (user_id, chatwork_room_id) => callPost('users.updateChatworkRoomId', { user_id, chatwork_room_id }),

    // シフト希望（管理者は全件 or 月単位）
    listShiftRequests: (params) => callGet('shiftRequests.list', params || {}),

    // シフト確定
    confirmShifts:     (payload)      => callPost('shiftConfirmed.create', payload),

    // エクスポート
    exportSpreadsheet: (year_month)   => callPost('exports.spreadsheet', { year_month }),
  };
})(window);
