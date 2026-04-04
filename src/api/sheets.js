/**
 * Google Sheets API v4
 * 工作表格式（第一列為標題，從第二列開始）：
 *   A: 時間   B: App 來源   C: 發送者   D: 內容   E: 狀態(pending/new/read)
 */

/**
 * 解析多種中文日期時間格式 → Unix timestamp (ms)
 * 支援：
 *   2026/4/1 下午 8:13:12
 *   2026/4/1 上午 10:48:39
 *   2026-04-01 20:13:12
 *   2026/4/1（純日期）
 */
const parseTs = (raw) => {
  if (!raw) return 0;

  // 中文上午/下午格式：YYYY/M/D 上午/下午 H:MM:SS
  const cnMatch = raw.match(
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*(上午|下午)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (cnMatch) {
    let [, y, mo, d, ampm, h, mi, s] = cnMatch;
    h = parseInt(h); mo = parseInt(mo) - 1;
    if (ampm === '下午' && h < 12) h += 12;
    if (ampm === '上午' && h === 12) h = 0;
    const dt = new Date(parseInt(y), mo, parseInt(d), h, parseInt(mi), parseInt(s || 0));
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  // 備援：直接讓 JS 嘗試解析（ISO 格式等）
  const t = new Date(raw).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * 將 Google Sheets B 欄的原始值標準化為與篩選按鈕完全一致的名稱
 * 處理大小寫差異、別名（Twitter→X、IG→Instagram）及多餘空白
 */
const normalizeApp = (raw) => {
  const a = (raw || '').trim().toLowerCase();
  if (!a)                                    return 'Sheets';
  if (a === 'gmail')                         return 'Gmail';
  if (a === 'line')                          return 'LINE';
  if (a === 'instagram' || a === 'ig')       return 'Instagram';
  if (a === 'x' || a === 'twitter' || a === 'twitter/x' || a === 'x (twitter)') return 'X';
  if (a === 'threads')                       return 'Threads';
  return raw.trim(); // 保留其他未知值（不強制轉換，避免遺漏新平台）
};

export const fetchSheetMessages = async (token, sheetId) => {
  if (!sheetId) throw new Error('未設定 VITE_SHEET_ID');

  const range  = encodeURIComponent('A2:E2000');  // 不指定工作表名稱，自動使用第一張（避免中文預設名稱 400 錯誤）
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Sheets API ${res.status}`);

  const { values = [] } = await res.json();

  // BLOCKED_APPS：這些平台的訊息在讀取時直接丟棄，不進入收件匣
  // BLOCKED_APPS：由 MacroDroid / 其他自動化寫入的 Gmail 通知已改由 Gmail API 直接讀取，
  // 這裡過濾掉 Sheets 中殘留的舊 Gmail 訊息，避免重複顯示。
  const BLOCKED_APPS = new Set(['x', 'twitter', 'twitter/x', 'x (twitter)', 'gmail']);

  return values
    .filter(row => row[3])          // 至少要有內容欄
    .filter(row => !BLOCKED_APPS.has((row[1] || '').trim().toLowerCase())) // 排除 X/Twitter
    .map((row) => {
      const time    = row[0] || '';
      const app     = normalizeApp(row[1]); // 標準化 app 名稱（避免大小寫、別名問題）
      const sender  = row[2] || '未知';
      const content = row[3] || '';
      // 用「時間+來源+發送者+內容前40字」組成穩定 ID，避免索引偏移導致 ID 改變
      const raw = `${time}|${app}|${sender}|${content.slice(0, 40)}`;
      const id  = 'sheet_' + raw.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0).toString(36);
      return {
        id,
        time,
        ts:     parseTs(time),
        app,
        sender,
        content,
        status: row[4] || 'new',
        source: 'sheets',
      };
    });
};
