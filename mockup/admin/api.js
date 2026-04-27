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
    { user_id: 10001, name: '田中 太郎', category: '通所',     email: 'tanaka@example.com',     status: '利用中' },
    { user_id: 10002, name: '佐藤 次郎', category: '通所',     email: 'sato@example.com',       status: '利用中' },
    { user_id: 10003, name: '鈴木 三郎', category: '在宅',     email: 'suzuki@example.com',     status: '利用中' },
    { user_id: 10004, name: '高橋 花子', category: '通所',     email: 'takahashi@example.com',  status: '利用中' },
    { user_id: 10005, name: '伊藤 美咲', category: '在宅(関東)', email: 'ito@example.com',        status: '利用中' },
    { user_id: 10006, name: '渡辺 健太', category: '通所',     email: 'watanabe_e7@local',      status: '利用中' },
    { user_id: 10007, name: '山本 直樹', category: '在宅通所', email: 'yamamoto@example.com',   status: '利用中' },
    { user_id: 10008, name: '中村 さくら', category: '通所',     email: 'nakamura@example.com',   status: '利用中' },
    { user_id: 10009, name: '小林 海斗', category: '通所',     email: 'kobayashi@example.com',  status: '利用中' },
    { user_id: 10010, name: '加藤 結衣', category: '在宅',     email: 'kato@example.com',       status: '利用中' },
    { user_id: 10011, name: '吉田 翔',   category: '通所',     email: 'yoshida@example.com',    status: '停止' },
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
          user: { user_id: 99999, name: args.name, category: args.category, email: args.email, status: '利用中' },
        });
      case 'shiftRequests.list': {
        // 利用中10名のうち 8名が5月希望提出済み、2名が未提出（テスト互換）
        const submittedIds = [10001, 10002, 10004, 10005, 10006, 10007, 10008, 10010];
        return Promise.resolve(submittedIds.map(uid => ({
          user_id: uid, date: '2026-05-01', status: '提出済',
        })));
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
    listUsers: (status) => callGet('users.list', status ? { status } : null),
    inviteUser: (payload) => callPost('users.invite', payload),

    // シフト希望（管理者は全件 or 月単位）
    listShiftRequests: (params) => callGet('shiftRequests.list', params),
  };
})(window);
