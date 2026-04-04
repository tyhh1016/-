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

export const fetchSchoolSheetData = async (token, sheetId) => {
  if (!sheetId) return [];

  // 工作表名稱含中文需 encodeURIComponent
  const range = encodeURIComponent('校網資料!A2:D200');
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 工作表不存在（尚未建立）→ 回傳空陣列，不拋錯
  if (res.status === 400 || res.status === 404) return [];
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`SchoolSheets API ${res.status}`);

  const { values = [] } = await res.json();

  return values
    .filter(row => row[1])           // 至少要有標題欄
    .map((row, i) => {
      const date  = row[0]?.trim() || '';
      const title = row[1]?.trim() || '';
      const link  = row[2]?.trim() || '';
      const type  = row[3]?.trim() || '校網公告';

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
      // 升學 > 活動 > 公告；有日期 > 無日期；新 > 舊
      const score = x => (x.isExam ? 2 : x.isEvent ? 1 : 0);
      if (score(b) !== score(a)) return score(b) - score(a);
      return (b.date || '').localeCompare(a.date || '');
    });
};
