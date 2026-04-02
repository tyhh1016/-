/**
 * Google Sheets API v4
 * 工作表格式（第一列為標題，從第二列開始）：
 *   A: 時間   B: App 來源   C: 發送者   D: 內容   E: 狀態(pending/new/read)
 */

export const fetchSheetMessages = async (token, sheetId) => {
  if (!sheetId) throw new Error('未設定 VITE_SHEET_ID');

  const range  = encodeURIComponent('Sheet1!A2:E200');
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Sheets API ${res.status}`);

  const { values = [] } = await res.json();

  return values
    .filter(row => row[3])          // 至少要有內容欄
    .map((row, i) => ({
      id:      `sheet_${i}`,
      time:    row[0] || '',
      app:     row[1] || 'Sheets',
      sender:  row[2] || '未知',
      content: row[3] || '',
      status:  row[4] || 'new',
      source:  'sheets',
    }));
};
