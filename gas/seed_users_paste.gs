/**
 * Users マスタ — テンプレ＋手動貼付型シード
 *
 * `migrate_excel_users.gs` の代替/補完。
 * 移行元Excelが手元にない場合や、Googleスプレッドシート変換ができない場合に使用。
 *
 * 使い方:
 *   1. 下の USERS_TEMPLATE を直接編集（Excelからコピペで貼付できる形式）
 *   2. `seedUsersFromTemplate` を実行
 *   3. 既存 user_id はスキップ（冪等）
 *
 * Tab区切りや CSV から貼付する場合の補助関数 `parseUsersTSV` も用意。
 *
 * 出典: docs/shift_system_design.md Appendix A
 */

// ==================== テンプレ ====================

/**
 * 利用者リスト。
 *   - user_id: 10000番台（既存Excelの番号を踏襲）
 *   - category: "通所" / "在宅" / "在宅(関東)" / "在宅通所"
 *   - name: 利用者名
 *
 * Excelからコピペで埋める場合は parseUsersTSV を使う（下記）。
 */
const USERS_TEMPLATE = [
  // { user_id: 10001, name: '田中 太郎',     category: '通所' },
  // { user_id: 10002, name: '佐藤 次郎',     category: '通所' },
  // { user_id: 10003, name: '鈴木 三郎',     category: '在宅' },
  // { user_id: 10004, name: '高橋 花子',     category: '通所' },
  // { user_id: 10005, name: '伊藤 美咲',     category: '在宅(関東)' },
  // ... 必要な人数分追加
];

/**
 * Excel/スプレッドシートのA〜C列をコピーして貼り付ける用の生データ枠。
 *   - 各行はタブ区切り: user_id\tcategory\tname
 *   - 空行は無視
 *   - 1行目がヘッダーなら HAS_HEADER=true にする
 */
const RAW_TSV = `
`;
const HAS_HEADER = false;

// ==================== メイン ====================

function seedUsersFromTemplate() {
  let users = USERS_TEMPLATE.slice();
  if (RAW_TSV && RAW_TSV.trim().length > 0) {
    users = users.concat(parseUsersTSV(RAW_TSV, HAS_HEADER));
  }

  if (users.length === 0) {
    Logger.log('USERS_TEMPLATE と RAW_TSV のどちらも空です。');
    return;
  }

  const existing = readTable('Users');
  const existingIds = new Set(existing.map(u => Number(u.user_id)));

  const toInsert = [];
  const skipped = [];
  const errors = [];

  users.forEach(u => {
    const userId = Number(u.user_id);
    const name = String(u.name || '').trim();
    const rawCategory = u.category;

    if (!userId || !name) {
      errors.push({ user_id: userId, name: name, error: 'user_id か name が空' });
      return;
    }
    if (existingIds.has(userId)) {
      skipped.push({ user_id: userId, name: name });
      return;
    }
    try {
      const category = normalizeCategory(rawCategory);  // migrate_excel_users.gs の関数を再利用
      toInsert.push({
        user_id: userId,
        name: name,
        email: userId + '@local',
        password_hash: '',
        category: category,
        status: '利用中',
        invited_at: '',
        activated_at: '',
      });
    } catch (e) {
      errors.push({ user_id: userId, name: name, error: e.message });
    }
  });

  Logger.log('===== seedUsersFromTemplate =====');
  Logger.log('入力件数:        ' + users.length);
  Logger.log('  → 投入対象:     ' + toInsert.length);
  Logger.log('  → 既存スキップ: ' + skipped.length);
  Logger.log('  → エラー:       ' + errors.length);

  if (errors.length > 0) {
    Logger.log('--- エラー一覧 ---');
    errors.forEach(e => Logger.log('  #' + e.user_id + ' ' + e.name + ' → ' + e.error));
    throw new Error('入力エラー ' + errors.length + '件');
  }

  toInsert.forEach(u => appendRow('Users', u));
  Logger.log('完了: ' + toInsert.length + '件 投入しました');
}

/**
 * RAW_TSV を { user_id, category, name } の配列にパース。
 * Excelで A=user_id, B=category, C=name の3列をコピーして貼付した状態を想定。
 */
function parseUsersTSV(tsv, hasHeader) {
  const lines = tsv.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l.length > 0);
  if (hasHeader && lines.length > 0) lines.shift();
  return lines.map(line => {
    const cols = line.split('\t');
    return {
      user_id: Number(cols[0]),
      category: cols[1],
      name: cols[2],
    };
  });
}
