/**
 * ChatWork 通知連携 v1.1
 *
 * アーキテクチャ: マスターアカウント方式
 *   - APIトークン1本（Script Properties の CHATWORK_API_TOKEN）で全利用者に配信
 *   - 利用者ごとの個別ルームID は Users.chatwork_room_id に保持
 *   - chatwork_dry_run = TRUE にすると投稿せずログのみ出力（テスト用）
 *
 * 設定方法:
 *   GASエディタ → プロジェクトの設定 → スクリプトプロパティ
 *   キー: CHATWORK_API_TOKEN / 値: マスターアカウントのAPIトークン
 */

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

// ===== 内部ユーティリティ =====

function _getChatworkToken() {
  const token = PropertiesService.getScriptProperties().getProperty('CHATWORK_API_TOKEN');
  if (!token) throw new Error('CHATWORK_API_TOKEN が Script Properties に未設定です。GASエディタ → プロジェクトの設定 → スクリプトプロパティ で設定してください。');
  return token;
}

function _isChatworkDryRun() {
  try {
    const cfg = getConfig();
    return String(cfg.chatwork_dry_run || 'FALSE').toUpperCase() === 'TRUE';
  } catch (e) {
    return false;
  }
}

// ===== 送信 =====

/**
 * 指定ルームにメッセージを1件投稿する。
 * @param {string|number} roomId ChatWork ルームID（Users.chatwork_room_id）
 * @param {string} body メッセージ本文（ChatWork記法可）
 * @returns {{ ok: boolean, message_id?: string, error?: string, dry_run?: boolean }}
 */
function sendChatworkMessage(roomId, body) {
  if (!roomId || String(roomId).trim() === '') {
    return { ok: false, error: 'room_id が空です（chatwork_room_id 未登録）' };
  }

  if (_isChatworkDryRun()) {
    Logger.log('[ChatWork DRY RUN] room=' + roomId + '\n' + body);
    return { ok: true, dry_run: true, message_id: 'dry_run' };
  }

  const token = _getChatworkToken();
  const url = CHATWORK_API_BASE + '/rooms/' + roomId + '/messages';
  const options = {
    method: 'post',
    headers: { 'X-ChatWorkToken': token },
    payload: { body: body },
    muteHttpExceptions: true,
  };

  let res;
  try {
    res = UrlFetchApp.fetch(url, options);
  } catch (e) {
    return { ok: false, error: 'ネットワークエラー: ' + e.message };
  }

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code === 200 || code === 201) {
    let data = {};
    try { data = JSON.parse(text); } catch (e) { /* noop */ }
    return { ok: true, message_id: String(data.message_id || '') };
  }

  return { ok: false, error: 'HTTP ' + code + ': ' + text.substring(0, 200) };
}

/**
 * 複数ルームへ順次投稿する（スロットリング: 1件ごとに200ms待機）。
 * 1件失敗しても残りは継続する。
 * @param {Array<{ notification_id: number, room_id: string, body: string }>} items
 * @returns {Array<{ notification_id, ok, message_id?, error?, dry_run? }>}
 */
function sendChatworkBulk(items) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const r = sendChatworkMessage(item.room_id, item.body);
    results.push({ notification_id: item.notification_id, ...r });
    if (i < items.length - 1) Utilities.sleep(200);
  }
  return results;
}

// ===== メッセージテンプレート =====

/**
 * 通知タイプに応じたメッセージ本文を返す。
 * @param {string} type 'シフト確定通知' | '空き枠通知' | 'その他'
 * @param {object} data テンプレート変数
 * @returns {string} ChatWork記法の本文
 */
function formatNotificationMessage(type, data) {
  if (type === 'シフト確定通知') {
    const label = data.year_month
      ? data.year_month.replace('-', '年') + '月'
      : '翌月';
    return [
      '[info][title]シフトが確定しました[/title]',
      data.name + 'さん、' + label + 'のシフトが確定しました。',
      '通所予定: ' + (data.confirmed_count || 0) + '日',
      '',
      'アプリからご確認ください。',
      '[/info]',
    ].join('\n');
  }

  if (type === '空き枠通知') {
    const dateLabel = data.target_date
      ? data.target_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2月$3日')
      : '';
    return [
      '[info][title]空き枠のお知らせ[/title]',
      data.name + 'さん、' + dateLabel + 'に空きが出ました。',
      '追加申し込みは先着順です。アプリからご確認ください。',
      '[/info]',
    ].join('\n');
  }

  // その他（管理者からの一斉通知など）
  return '[info]' + (data.message || '') + '[/info]';
}

// ===== 高レベル: 通知レコード群への一括配信 =====

/**
 * Notifications テーブルの未送信レコードに対して ChatWork 配信を行い、
 * 送信結果を Notifications テーブルに書き戻す。
 * @param {Array<object>} notifications 送信対象の Notifications 行
 * @param {Array<object>} users Users テーブル全行（chatwork_room_id 取得用）
 * @returns {{ sent: number, failed: number, skipped: number }}
 */
function dispatchChatworkNotifications(notifications, users) {
  const userMap = {};
  users.forEach(u => { userMap[Number(u.user_id)] = u; });

  const items = [];
  notifications.forEach(notif => {
    const user = userMap[Number(notif.user_id)];
    if (!user || !user.chatwork_room_id) return; // room_id 未登録はスキップ

    const body = formatNotificationMessage(notif.type, {
      name: user.name,
      year_month: notif.target_date ? notif.target_date.substring(0, 7) : '',
      target_date: notif.target_date,
      confirmed_count: notif.confirmed_count || 0,
      message: notif.message,
    });

    items.push({
      notification_id: Number(notif.notification_id),
      room_id: String(user.chatwork_room_id),
      body: body,
    });
  });

  const results = sendChatworkBulk(items);

  let sent = 0, failed = 0, skipped = notifications.length - items.length;
  const now = nowJst();

  results.forEach(r => {
    if (r.ok) {
      sent++;
      updateRow('Notifications',
        row => Number(row.notification_id) === r.notification_id,
        {
          chatwork_sent_at: now,
          chatwork_message_id: r.message_id || '',
          chatwork_error: '',
        }
      );
    } else {
      failed++;
      updateRow('Notifications',
        row => Number(row.notification_id) === r.notification_id,
        { chatwork_error: r.error || 'unknown error' }
      );
    }
  });

  Logger.log('ChatWork配信: sent=' + sent + ' failed=' + failed + ' skipped=' + skipped);
  return { sent, failed, skipped };
}

// ===== 動作テスト（GASエディタから直接実行） =====

/**
 * dry_run モードで ChatWork 送信テストを行う。
 * 実際には投稿しない。_Config の chatwork_dry_run を TRUE にしてから実行すること。
 */
function testChatworkDryRun() {
  const result = sendChatworkMessage('123456', '[info][title]テスト[/title]動作確認です。[/info]');
  Logger.log(JSON.stringify(result));
  if (result.dry_run) {
    Logger.log('✓ dry_run モードで正常動作。実際の投稿は行われていません。');
  } else if (result.ok) {
    Logger.log('✓ 送信成功: message_id=' + result.message_id);
  } else {
    Logger.log('✗ 送信失敗: ' + result.error);
  }
}
