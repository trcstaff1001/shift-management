/**
 * シフト管理 — 利用者画面 API ラッパ
 *
 * GAS Web App エンドポイント (CONFIG.GAS_ENDPOINT) に対する fetch ラッパ。
 * `<script src="../../config.js"></script>` の後に読み込む前提。
 *
 *   - CONFIG が未定義 / GAS_ENDPOINT がプレースホルダの場合は **モックモード** で動作。
 *   - GAS の Web App 公開「Anyone (誰でも)」前提。Content-Type=text/plain で preflight 回避。
 *   - レスポンスは { ok: bool, data?, error?, code? } 形式。
 *
 * セッションは localStorage に { user_id, name, category } のみ保持。
 * パスワードや token は持たない（フェーズ1）。
 */

(function (global) {
  'use strict';

  const SESSION_KEY = 'shift_user_session';
  const PLACEHOLDER = '__YOUR_DEPLOYMENT_ID__';

  // ===== モード判定 =====

  function isMockMode() {
    return typeof CONFIG === 'undefined'
      || !CONFIG.GAS_ENDPOINT
      || CONFIG.GAS_ENDPOINT.indexOf(PLACEHOLDER) >= 0;
  }

  // ===== HTTP =====

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
      // text/plain にして CORS preflight (OPTIONS) を回避
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
    });
    return _parse(res);
  }

  async function _parse(res) {
    if (!res.ok) {
      throw new Error('ネットワークエラー (HTTP ' + res.status + ')');
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error('レスポンス解析エラー（JSONではありません）');
    }
    if (!json.ok) {
      const msg = json.error || 'API エラー';
      const code = json.code ? ' [' + json.code + ']' : '';
      throw new Error(msg + code);
    }
    return json.data != null ? json.data : json;
  }

  // ===== セッション =====

  function setSession(user) {
    if (!user) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      user_id: Number(user.user_id),
      name: user.name,
      category: user.category,
    }));
  }

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /** セッションが無ければ login.html にリダイレクトして例外を投げる。 */
  function requireSession() {
    const s = getSession();
    if (!s) {
      location.href = 'login.html';
      throw new Error('NO_SESSION');
    }
    return s;
  }

  // ===== モックモード =====

  function _mockNow() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function _mockDate() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _mock(action, args) {
    console.info('[ShiftAPI mock]', action, args);
    args = args || {};
    switch (action) {
      case 'auth.login':
        return Promise.resolve({
          user: { user_id: 10001, name: '田中 太郎', category: '通所' },
        });
      case 'users.list':
        return Promise.resolve([
          { user_id: 10001, name: '田中 太郎', category: '通所', status: '利用中' },
        ]);
      case 'shiftRequests.list': {
        // モック用ダミーデータ: 5月の確定/希望/不承認サンプル
        const month = (args && args.month) || '2026-05';
        return Promise.resolve([
          { user_id: 10001, date: month + '-01', status: '承認' },
          { user_id: 10001, date: month + '-02', status: '承認' },
          { user_id: 10001, date: month + '-07', status: '承認' },
          { user_id: 10001, date: month + '-08', status: '承認' },
          { user_id: 10001, date: month + '-12', status: '承認' },
          { user_id: 10001, date: month + '-13', status: '承認' },
          { user_id: 10001, date: month + '-14', status: '承認' },
          { user_id: 10001, date: month + '-15', status: '承認' },
          { user_id: 10001, date: month + '-19', status: '承認' },
          { user_id: 10001, date: month + '-20', status: '承認' },
          { user_id: 10001, date: month + '-22', status: '提出済' },
          { user_id: 10001, date: month + '-26', status: '提出済' },
          { user_id: 10001, date: month + '-27', status: '提出済' },
          { user_id: 10001, date: month + '-28', status: '提出済' },
          { user_id: 10001, date: month + '-29', status: '不承認' },
        ]);
      }
      case 'shiftRequests.create':
        return Promise.resolve({ created: args.dates || [], skipped: [] });
      case 'attendances.clockIn': {
        const date = (args && args.date) || _mockDate();
        const rec = { attendance_id: 9001, user_id: 10001, date, status: '未確定', clock_in: _mockNow(), clock_out: '', source: 'self_clock' };
        try { sessionStorage.setItem('_mock_att_' + date, JSON.stringify(rec)); } catch (e) {}
        return Promise.resolve(rec);
      }
      case 'attendances.clockOut': {
        const date = (args && args.date) || _mockDate();
        const stored = sessionStorage.getItem('_mock_att_' + date);
        const rec = stored ? JSON.parse(stored) : { attendance_id: 9001, user_id: 10001, date, status: '未確定', clock_in: '09:00', clock_out: '' };
        rec.status = '出勤';
        rec.clock_out = _mockNow();
        try { sessionStorage.setItem('_mock_att_' + date, JSON.stringify(rec)); } catch (e) {}
        return Promise.resolve(rec);
      }
      case 'attendances.list': {
        const date = args && args.date;
        if (date) {
          const stored = sessionStorage.getItem('_mock_att_' + date);
          return Promise.resolve(stored ? [JSON.parse(stored)] : []);
        }
        return Promise.resolve([]);
      }
      case 'notifications.list':
        return Promise.resolve([
          { notification_id: 1, type: 'シフト確定通知', target_date: '2026-05-01', message: '', is_read: 'FALSE', created_at: '2026-04-25 10:00:00' },
          { notification_id: 2, type: '空き枠通知',     target_date: '2026-04-30', message: '', is_read: 'FALSE', created_at: '2026-04-26 14:30:00' },
          { notification_id: 3, type: 'シフト確定通知', target_date: '2026-04-01', message: '', is_read: 'TRUE',  created_at: '2026-03-25 09:00:00' },
        ]);
      case 'notifications.unreadCount':
        return Promise.resolve({ count: 2 });
      case 'notifications.markRead':
        return Promise.resolve({ updated: true });
      default:
        return Promise.reject(new Error('mock 未対応 action: ' + action));
    }
  }

  // ===== UI ヘルパ =====

  /** ボタンの送信中表示（テキスト・disabled切替）。返り値で元に戻せる。 */
  function busyButton(btn, label) {
    if (!btn) return () => {};
    const prevText = btn.textContent;
    const prevDisabled = btn.disabled;
    btn.textContent = label || '送信中…';
    btn.disabled = true;
    return () => {
      btn.textContent = prevText;
      btn.disabled = prevDisabled;
    };
  }

  // ===== 高水準ラッパ =====

  global.ShiftAPI = {
    isMockMode,

    // 認証
    async login(user_id, password) {
      const data = await callPost('auth.login', { user_id, password });
      setSession(data.user || data);
      return data.user || data;
    },
    logout() {
      clearSession();
      location.href = 'login.html';
    },
    getSession,
    setSession,
    clearSession,
    requireSession,

    // 利用者
    async getMe() {
      const s = requireSession();
      // モックモードはセッションを返すだけ
      if (isMockMode()) return s;
      const users = await callGet('users.list', { status: '利用中' });
      return users.find(u => Number(u.user_id) === Number(s.user_id)) || s;
    },

    // シフト希望
    async listMyShiftRequests(month) {
      const s = requireSession();
      return callGet('shiftRequests.list', { user_id: s.user_id, month });
    },
    async submitShiftRequests(dates) {
      const s = requireSession();
      return callPost('shiftRequests.create', { user_id: s.user_id, dates });
    },

    // 打刻
    async clockIn(date) {
      const s = requireSession();
      return callPost('attendances.clockIn', { user_id: s.user_id, date });
    },
    async clockOut(date) {
      const s = requireSession();
      return callPost('attendances.clockOut', { user_id: s.user_id, date });
    },
    async getTodayAttendance(date) {
      const s = requireSession();
      const rows = await callGet('attendances.list', { user_id: s.user_id, date });
      return Array.isArray(rows) ? (rows[0] || null) : null;
    },

    // 通知
    async getUnreadCount() {
      const s = requireSession();
      return callGet('notifications.unreadCount', { user_id: s.user_id });
    },
    async listNotifications() {
      const s = requireSession();
      return callGet('notifications.list', { user_id: s.user_id });
    },
    async markRead(notificationIds) {
      const s = requireSession();
      const payload = { user_id: s.user_id };
      if (notificationIds) payload.notification_ids = notificationIds;
      return callPost('notifications.markRead', payload);
    },

    // ヘルパ
    busyButton,
  };
})(window);
