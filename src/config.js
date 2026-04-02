// ════════════════════════════════════════════════
//  SmartPlannerHub — 設定檔
//  將對應的值填入 .env（複製 .env.example 並修改）
// ════════════════════════════════════════════════

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const SHEET_ID         = import.meta.env.VITE_SHEET_ID         ?? '';
export const SCHOOL_URL       = import.meta.env.VITE_SCHOOL_URL       ?? 'https://www.fgsh.khc.edu.tw/';
