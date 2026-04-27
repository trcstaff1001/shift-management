/**
 * 既存Excel（月別シート）→ Users マスタ移行
 *
 * 設計書 Appendix A 準拠:
 *   - 移行元: 月別シート（例: "26年5月"）
 *   - A列: user_id（10000番台）
 *   - B列: カテゴリ（"通所" / "在宅" / "在宅(関東)" / "在宅/通所" 等）
 *   - C列: 利用者名
 *   - D〜G列: 工賃・上限・予定・皆勤率（移行対象外）
 *
 * 移行方針:
 *   - email: `${user_id}@local`（ダミーemail。後で管理者が編集可能）
 *   - password_hash: 空（初回招待メール送信時 or 管理者UIでリセット時に設定）
 *   - status: "利用中"
 *   - 既存 Users に同 user_id があればスキップ（冪等）
 *
 * 実行手順:
 *   1. 移行元スプレッドシートを共有設定で本Googleアカウントにアクセス可能にする
 *   2. SOURCE_SPREADSHEET_ID と SOURCE_SHEET_NAME を本ファイル冒頭で設定
 *   3. `dryRunMigrateUsers` を実行 → 取り込まれる行を Logger で確認
 *   4. 問題なければ `migrateUsers` を実行
 *
 * 出典: docs/shift_system_design.md Appendix A
 */

// ==================== 設定 ====================

/** 移行元スプレッドシート（既存ExcelをGoogleスプレッドシートに変換したもの）のID */
const SOURCE_SPREADSHEET_ID = ''; // 例: '1AbCdEfGhIjKlMnOpQrStUv...'

/** 利用者マスタを取り出す月別シート名（最新月推奨） */
const SOURCE_SHEET_NAME = '26年5月';

/** 利用者データの開始行（1始まり、ヘッダー行を除く） */
const ROW_START = 2;

/** 利用者データの終了行（auto = 自動検出 / 数値指定可） */
const ROW_END = 'auto';

/** 列マッピング（1始まり、A=1, B=2, ...） */
const COLUMN_MAP = {
  user_id:  1,  // A列
  category: 2,  // B列
  name:     3,  // C列
};

// ==================== カテゴリ正規化 ====================

/**
 * 移行元の表記揺れを Users.category の正式値に揃える。
 * 想定外の表記は throw して気付けるようにする（黙ってマップしない）。
 */
function normalizeCategory(raw) {
  if (raw == null) throw new Error('カテゴリが空です');
  const s = String(raw).trim().replace(/\s+/g, '');

  // 複合表記の整理
  const map = {
    '通所':         '通所',
    '在宅':         '在宅',
    '在宅(関東)':   '在宅(関東)',
    '在宅（関東）': '在宅(関東)',
    '在宅関東':     '在宅(関東)',
    '在宅/通所':    '在宅通所',
    '在宅／通所':   '在宅通所',
    '通所/在宅':    '在宅通所',
    '在宅通所':     '在宅通所',
  };
  if (map[s]) return map[s];
  throw new Error('未対応のカテゴリ表記: "' + raw + '" — normalizeCategory のマップを更新してください');
}

// ==================== メイン ====================

/**
 * 移行のドライラン。実際には書き込まず、何件入る・何件スキップするかをログ出力。
 */
function dryRunMigrateUsers() {
  _runMigrate(true);
}

/**
 * 本番移行。Users タブに書き込む（同 user_id があればスキップ）。
 */
function migrateUsers() {
  _runMigrate(false);
}

function _runMigrate(dryRun) {
  if (!SOURCE_SPREADSHEET_ID) {
    throw new Error('SOURCE_SPREADSHEET_ID を設定してください（本ファイル冒頭）');
  }

  // 1. 移行元読み取り
  const srcSs = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const srcSheet = srcSs.getSheetByName(SOURCE_SHEET_NAME);
  if (!srcSheet) {
    throw new Error('移行元シートが見つかりません: "' + SOURCE_SHEET_NAME + '"');
  }
  const lastRow = ROW_END === 'auto' ? srcSheet.getLastRow() : ROW_END;
  if (lastRow < ROW_START) {
    Logger.log('移行元にデータ行がありません');
    return;
  }
  const maxCol = Math.max(COLUMN_MAP.user_id, COLUMN_MAP.category, COLUMN_MAP.name);
  const rows = srcSheet.getRange(ROW_START, 1, lastRow - ROW_START + 1, maxCol).getValues();

  // 2. 既存 Users 取得
  const existingUsers = readTable('Users');
  const existingIds = new Set(existingUsers.map(u => Number(u.user_id)));

  // 3. 移行対象を組み立て
  const toInsert = [];
  const skipped = [];
  const errors = [];

  rows.forEach((row, i) => {
    const userId = Number(row[COLUMN_MAP.user_id - 1]);
    const rawCategory = row[COLUMN_MAP.category - 1];
    const name = String(row[COLUMN_MAP.name - 1] || '').trim();

    if (!userId || !name) return;  // 空行スキップ

    if (existingIds.has(userId)) {
      skipped.push({ user_id: userId, name: name, reason: '既に存在' });
      return;
    }

    try {
      const category = normalizeCategory(rawCategory);
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

  // 4. ログ出力
  Logger.log('===== 移行サマリ =====');
  Logger.log('移行元行数:        ' + rows.length);
  Logger.log('既存Users件数:     ' + existingUsers.length);
  Logger.log('  → 新規投入対象:  ' + toInsert.length);
  Logger.log('  → スキップ(既存):' + skipped.length);
  Logger.log('  → エラー:        ' + errors.length);

  if (errors.length > 0) {
    Logger.log('--- エラー一覧 ---');
    errors.forEach(e => Logger.log('  #' + e.user_id + ' ' + e.name + ' → ' + e.error));
    throw new Error('カテゴリ正規化エラー ' + errors.length + '件。エラー一覧を確認してください。');
  }

  if (dryRun) {
    Logger.log('--- 投入予定（最初の10件） ---');
    toInsert.slice(0, 10).forEach(u => {
      Logger.log('  #' + u.user_id + ' ' + u.name + ' [' + u.category + ']');
    });
    if (toInsert.length > 10) Logger.log('  ... 他 ' + (toInsert.length - 10) + ' 件');
    Logger.log('※ ドライラン実行のため書き込みは行いませんでした');
    Logger.log('※ 本番投入は migrateUsers を実行してください');
    return;
  }

  // 5. 本番投入
  Logger.log('--- 投入開始 ---');
  toInsert.forEach(u => {
    appendRow('Users', u);
  });
  Logger.log('完了: ' + toInsert.length + '件 投入しました');

  if (skipped.length > 0) {
    Logger.log('--- スキップ（既存）---');
    skipped.slice(0, 5).forEach(s => {
      Logger.log('  #' + s.user_id + ' ' + s.name);
    });
    if (skipped.length > 5) Logger.log('  ... 他 ' + (skipped.length - 5) + ' 件');
  }
}
