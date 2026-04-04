// ════════════════════════════════════════════════
//  SmartPlannerHub — 設定檔
//  將對應的值填入 .env（複製 .env.example 並修改）
// ════════════════════════════════════════════════

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const SHEET_ID         = import.meta.env.VITE_SHEET_ID         ?? '';
export const SCHOOL_URL       = import.meta.env.VITE_SCHOOL_URL       ?? 'https://www.fhsh.khc.edu.tw/';

// ── 除錯用（確認環境變數有無成功注入）── 確認後可刪除此區塊 ──
console.log('[SmartHub ENV]', {
  VITE_SHEET_ID:         import.meta.env.VITE_SHEET_ID         || '(空白)',
  VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID ? import.meta.env.VITE_GOOGLE_CLIENT_ID.slice(0, 12) + '…' : '(空白)',
  VITE_SCHOOL_URL:       import.meta.env.VITE_SCHOOL_URL       || '(空白，使用預設值)',
  MODE:                  import.meta.env.MODE,
});
