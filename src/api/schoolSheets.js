/**
 * 從 Google Sheets「校網資料」工作表讀取校園公告
 *
 * 工作表格式（Apps Script 寫入）：
 *   A: 日期（YYYY-MM-DD）
 *   B: 標題
 *   C: 內容/連結
 *   D: 類型（升學資訊 / 全校活動 / 校網公告）
 */

const EXAM_KW  = /升學|學測|指考|申請入學|繁星|甄試|備審|大學|推薦|分科|選填|志願|錄取|面試|術科|統測|入學|考招/;
const EVENT_KW = /活動|運動會|畢業|典禮|競賽|比賽|校慶|社團|研習|演講|參觀|旅行|露營|表演|音樂|舞蹈|美展|科展|學藝|營隊|家長日|懇親|說明會/;

/** 將二維陣列（rows × cols）轉成公告物件陣列 */
const parseSchoolRows = (rows) =>
  rows
    .filter(row => row[1])           // 至少要有標題欄
    .map((row, i) => {
      const date  = (row[0] || '').trim();
      const title = (row[1] || '').trim();
      const link  = (row[2] || '').trim();
      const type  = (row[3] || '').trim() || '校網公告';
      const isExam  = type === '升學資訊' || EXAM_KW.test(title);
      const isEvent = type === '全校活動' || EVENT_KW.test(title);
      return {
        id:      `school_sheet_${i}`,
        date,
        title,
        url:     link.startsWith('http') ? link : '',
        content: link,
        tag:     isExam ? '升學資訊' : isEvent ? '全校活動' : '校網公告',
        type,
        isExam,
        isEvent,
        source:  'school',
      };
    })
    .sort((a, b) => {
      const score = x => (x.isExam ? 2 : x.isEvent ? 1 : 0);
      if (score(b) !== score(a)) return score(b) - score(a);
      return (b.date || '').localeCompare(a.date || '');
    });

/**
 * 透過 spreadsheet metadata 找出「校網資料」工作表的數字 sheetId
 * （用數字 ID 比 URL-encode 中文名稱更穩定）
 */
const findSchoolSheetNumericId = async (token, spreadsheetId) => {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const { sheets = [] } = await res.json();
  const target = sheets.find(s => s.properties?.title === '校網資料');
  return target?.properties?.sheetId ?? null;   // 數字，例如 1234567890
};

/**
 * 主要匯出：讀取「校網資料」工作表
 *
 * 容錯策略：
 *   1. 直接用中文 sheet 名稱 URL-encode 請求（最快）
 *   2. 若回 400/404，改透過 spreadsheets.get + includeGridData 以數字 sheetId 指定工作表
 *   3. 若工作表根本不存在（Apps Script 尚未執行）→ 靜默回傳 []
 */
export const fetchSchoolSheetData = async (token, sheetId) => {
  if (!sheetId) return [];

  // ── 策略一：中文工作表名稱直接請求 ──────────────────────
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    encodeURIComponent('校網資料!A2:D200'),
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.ok) {
    const { values = [] } = await res.json();
    return parseSchoolRows(values);
  }

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');

  // ── 策略二：400/404 → 查 metadata 取數字 sheetId，再用 includeGridData 方式請求 ──
  if (res.status === 400 || res.status === 404) {
    const numericId = await findSchoolSheetNumericId(token, sheetId).catch(() => null);
    if (numericId === null) return [];   // 工作表尚未建立

    // spreadsheets.get 搭配 includeGridData 可以只取特定工作表的資料
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
      `?includeGridData=true` +
      `&ranges=${encodeURIComponent('A2:D200')}` +
      `&fields=sheets(properties.sheetId,data.rowData.values.formattedValue)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dataRes.ok) return [];

    const { sheets = [] } = await dataRes.json();
    const sheet = sheets.find(s => s.properties?.sheetId === numericId);
    if (!sheet) return [];

    const rows = (sheet.data?.[0]?.rowData || [])
      .map(r => (r.values || []).map(c => c.formattedValue || ''));
    return parseSchoolRows(rows);
  }

  // 其他非預期錯誤 → 丟出讓外層統一處理
  throw new Error(`SchoolSheets API ${res.status}`);
};
