/**
 * 共通ヘルパー
 *
 * - Sheets 読み書き（行→オブジェクト変換、ヘッダー名でアクセス）
 * - ID採番 + LockService（同時書き込みの直列化）
 * - JST タイムスタンプ整形
 * - SHA-256 + salt パスワードハッシュ
 * - JSON レスポンス
 *
 * 出典: docs/sheets_schema.md, docs/shift_system_design.md §5
 */

// ID列定義（PKが数値採番のテーブル）
const ID_COLUMNS = {
  Users:          'user_id',
  Admins:         'admin_id',
  ShiftRequests:  'request_id',
  ShiftConfirmed: 'confirmed_id',
  Attendances:    'attendance_id',
  Notifications:  'notification_id',
  _ExportLogs:    'export_id',   // v1.1新規
};

// ===== Sheets I/O =====

/**
 * テーブル全件読み込み。1行=1オブジェクト（ヘッダー名キー）で返す。
 * 空行（全列空文字）はスキップ。
 */
function readTable(tableName) {
  const sheet = _getSheet(tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

/**
 * 1行追加（LockService + ID採番込み）。
 *   - ID列が定義されているテーブルは自動採番（明示指定があれば優先）
 *   - created_at / updated_at が列にあれば JST 現在時刻を自動セット
 *   - 戻り値: 採番されたIDを含むオブジェクト
 */
function appendRow(tableName, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getSheet(tableName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idCol = ID_COLUMNS[tableName];
    const now = nowJst();
    const row = { ...payload };

    if (idCol && row[idCol] == null) {
      row[idCol] = _nextId(sheet, headers.indexOf(idCol) + 1);
    }
    if (headers.includes('created_at') && !row.created_at) row.created_at = now;
    if (headers.includes('updated_at') && !row.updated_at) row.updated_at = now;

    const newRow = headers.map(h => row[h] != null ? row[h] : '');
    sheet.appendRow(newRow);
    return row;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 単一行更新。matcher(row) === true の行を見つけて patch をマージ。
 * updated_at は自動更新。
 */
function updateRow(tableName, matcher, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getSheet(tableName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const lastCol = sheet.getLastColumn();
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values[0];

    for (let i = 1; i < values.length; i++) {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = values[i][j]; });
      if (matcher(obj)) {
        const merged = { ...obj, ...patch };
        if (headers.includes('updated_at')) merged.updated_at = nowJst();
        const newRow = headers.map(h => merged[h] != null ? merged[h] : '');
        sheet.getRange(i + 1, 1, 1, lastCol).setValues([newRow]);
        return merged;
      }
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

function _getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('タブが存在しません: ' + name);
  return sheet;
}

function _nextId(sheet, columnIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, columnIndex, lastRow - 1, 1).getValues().flat()
    .map(v => Number(v)).filter(v => !isNaN(v) && v > 0);
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

// ===== 設定値 =====

/** _Config を key→value のオブジェクトで返す（数値はNumber化）。 */
function getConfig() {
  const rows = readTable('_Config');
  const cfg = {};
  rows.forEach(r => {
    const v = String(r.value);
    cfg[r.key] = isNaN(Number(v)) ? v : Number(v);
  });
  return cfg;
}

// ===== 日時 =====

function nowJst() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function todayJst() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// ===== パスワード =====

/**
 * パスワードハッシュ生成。形式: `${saltB64}:${hashB64}`
 *   - salt: 16バイトランダム
 *   - hash: SHA-256(salt_bytes || plaintext_utf8)
 */
function hashPassword(plaintext) {
  const saltBytes = _randomBytes(16);
  const saltB64 = Utilities.base64Encode(saltBytes);
  const hashB64 = _sha256B64(saltBytes, plaintext);
  return saltB64 + ':' + hashB64;
}

/** 平文と保存済みハッシュ文字列を比較。 */
function verifyPassword(plaintext, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [saltB64, expectedB64] = stored.split(':');
  const saltBytes = Utilities.base64Decode(saltB64);
  const actualB64 = _sha256B64(saltBytes, plaintext);
  return actualB64 === expectedB64;
}

function _sha256B64(saltBytes, plaintext) {
  const plainBytes = Utilities.newBlob(plaintext).getBytes();
  const input = saltBytes.concat(plainBytes);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return Utilities.base64Encode(digest);
}

function _randomBytes(n) {
  const bytes = [];
  for (let i = 0; i < n; i++) {
    bytes.push(Math.floor(Math.random() * 256) - 128);
  }
  return bytes;
}

// ===== JSON レスポンス =====

function jsonResponse(obj, status) {
  const body = { ok: status !== 'error', ...obj };
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, code) {
  return jsonResponse({ ok: false, error: message, code: code || 'ERROR' }, 'error');
}
