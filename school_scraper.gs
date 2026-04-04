/**
 * ════════════════════════════════════════════════════════
 *  鳳新高中校網資料爬取 — Google Apps Script
 *  目標：https://www.fhsh.khc.edu.tw/
 *
 *  使用方式：
 *    1. 開啟 Google Sheets → 擴充功能 → Apps Script
 *    2. 貼上此程式碼，儲存
 *    3. 執行一次 「setupTrigger」 設定每日自動觸發
 *    4. 第一次執行需授權（允許存取 Sheets 及外部網路）
 *
 *  Sheet 格式（工作表名稱：校網資料）：
 *    A: 日期（YYYY-MM-DD）
 *    B: 標題
 *    C: 內容 / 連結
 *    D: 類型（升學資訊 / 全校活動 / 校網公告）
 * ════════════════════════════════════════════════════════
 */

// ── 設定 ─────────────────────────────────────────────
const SCHOOL_URL   = 'https://www.fhsh.khc.edu.tw/';
const SHEET_NAME   = '校網資料';
const MAX_ITEMS    = 50;   // 最多保留幾筆

// ── 關鍵字分類 ────────────────────────────────────────
const EXAM_KW  = /升學|學測|指考|申請入學|繁星|甄試|備審|大學|推薦|分科|選填|志願|錄取|面試|術科|統測|備審資料|個人申請|入學|考招|學力/;
const EVENT_KW = /活動|運動會|畢業|典禮|競賽|比賽|校慶|社團|研習|演講|參觀|旅行|露營|表演|音樂|舞蹈|美展|科展|學藝|營隊|家長日|懇親|說明會/;

// ════════════════════════════════════════════════════════
//  主程式：抓取並寫入 Sheets
// ════════════════════════════════════════════════════════
function fetchAndSaveSchoolData() {
  Logger.log('開始抓取校網資料…');

  const pages = buildPageList();
  let items = [];

  for (const url of pages) {
    try {
      const html = fetchPage(url);
      if (!html) continue;

      const parsed = parseHtml(html, url);
      Logger.log(`${url} → 解析到 ${parsed.length} 筆`);

      items = items.concat(parsed);
      if (items.length >= MAX_ITEMS) break;
    } catch (e) {
      Logger.log(`抓取失敗 ${url}: ${e.message}`);
    }
  }

  // 去重（依標題）
  const seen = new Set();
  const unique = items.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  Logger.log(`去重後共 ${unique.length} 筆，準備寫入工作表…`);
  writeToSheet(unique);
  Logger.log('完成！');
}

// ════════════════════════════════════════════════════════
//  要抓取的頁面列表
// ════════════════════════════════════════════════════════
function buildPageList() {
  const base = SCHOOL_URL.replace(/\/$/, '');
  return [
    base + '/',
    base + '/modules/tadnews/',          // 高雄市學校 XOOPS TadNews 模組
    base + '/modules/news/',
    base + '/modules/tad_discuss/',
    base + '/modules/tad_activity/',     // 活動模組
    base + '/news/',
    base + '/bulletin/',
    base + '/announce/',
    base + '/index.php',
  ];
}

// ════════════════════════════════════════════════════════
//  HTTP 抓取（Apps Script 端，無 CORS 限制）
// ════════════════════════════════════════════════════════
function fetchPage(url) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      Logger.log(`${url} → HTTP ${code}`);
      return null;
    }

    // 嘗試偵測並轉換編碼（台灣學校常用 Big5 / UTF-8）
    const bytes = resp.getContent();
    let html;
    try {
      html = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    } catch (e) {
      html = Utilities.newBlob(bytes).getDataAsString('Big5');
    }

    // 若 HTML 中有 charset=big5 且內容有亂碼，改用 Big5
    if (/charset\s*=\s*["']?big5/i.test(html) && html.includes('?')) {
      try { html = Utilities.newBlob(bytes).getDataAsString('Big5'); } catch (_) {}
    }

    return html;
  } catch (e) {
    Logger.log(`fetchPage error ${url}: ${e.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════
//  HTML 解析（Apps Script 無 DOMParser，用 Regex）
// ════════════════════════════════════════════════════════
function parseHtml(html, baseUrl) {
  const items = [];

  // ── 策略 1：找 <a> 標籤周圍的日期 ─────────────────
  // 台灣學校 CMS 常見模式：
  //   <td>2026-04-01</td><td><a href="...">標題</a></td>
  //   <span class="date">2026/04/01</span> <a>標題</a>

  // 通用：找所有 <a href> 配合附近日期
  const linkPattern = /<a\s[^>]*href\s*=\s*["']([^"'#javascript][^"']*)["'][^>]*>([\s\S]{4,120}?)<\/a>/gi;
  let m;

  while ((m = linkPattern.exec(html)) !== null) {
    const rawHref  = m[1];
    const rawTitle = stripTags(m[2]).trim();

    if (!rawTitle || rawTitle.length < 5 || rawTitle.length > 130) continue;
    if (isNavText(rawTitle)) continue;

    // 找連結前後 300 字元內的日期
    const context = html.substring(Math.max(0, m.index - 200), m.index + m[0].length + 200);
    const date    = extractDate(context);

    let url = rawHref.trim();
    if (!url.startsWith('http')) {
      try { url = new URL(url, baseUrl).href; } catch (_) { url = ''; }
    }

    // 若轉換後只剩首頁根路徑（無具體文章），清空連結
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/' || parsed.pathname === '') url = '';
    } catch (_) { url = ''; }

    const type = classifyTitle(rawTitle);
    items.push({ date, title: rawTitle, content: url, type });

    if (items.length >= MAX_ITEMS * 2) break;
  }

  // ── 策略 2：找純文字公告段落（無連結） ────────────
  // 有些學校只在首頁顯示公告文字
  const textPattern = /(<div|<li|<p|<td)[^>]*class=["'][^"']*(?:news|announce|bulletin|title)[^"']*["'][^>]*>([\s\S]{10,200}?)<\/(?:div|li|p|td)>/gi;
  while ((m = textPattern.exec(html)) !== null) {
    const rawText = stripTags(m[2]).trim();
    if (!rawText || rawText.length < 8 || rawText.length > 130) continue;
    if (isNavText(rawText)) continue;

    const context = html.substring(Math.max(0, m.index - 100), m.index + m[0].length + 100);
    const date    = extractDate(context);
    const type    = classifyTitle(rawText);

    items.push({ date, title: rawText, content: '', type });
    if (items.length >= MAX_ITEMS * 2) break;
  }

  return items;
}

// ── 工具：去除 HTML 標籤 ─────────────────────────────
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// ── 工具：從文字中提取日期字串 ──────────────────────
function extractDate(text) {
  // 支援：2026-04-01 / 2026/04/01 / 115/04/01（民國年） / 2026年4月1日
  const patterns = [
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,          // 西元
    /(\d{3})[-\/](\d{1,2})[-\/](\d{1,2})/,           // 民國
    /(\d{4})年(\d{1,2})月(\d{1,2})日?/,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (!m) continue;

    let y = parseInt(m[1]);
    const mo = parseInt(m[2]).toString().padStart(2, '0');
    const d  = parseInt(m[3]).toString().padStart(2, '0');

    // 民國年轉西元
    if (y < 200) y += 1911;

    // 合理年份範圍
    const now = new Date().getFullYear();
    if (y < now - 2 || y > now + 2) continue;

    return `${y}-${mo}-${d}`;
  }
  return '';
}

// ── 工具：過濾導覽列文字 ─────────────────────────────
function isNavText(text) {
  return /^(首頁|回首頁|English|更多|more|回上頁|login|logout|search|網站地圖|sitemap|facebook|instagram|youtube|line|FB|IG|回頂端|選單|menu|:::|\d+)$/i.test(text.trim());
}

// ── 工具：依關鍵字分類 ──────────────────────────────
function classifyTitle(title) {
  if (EXAM_KW.test(title))  return '升學資訊';
  if (EVENT_KW.test(title)) return '全校活動';
  return '校網公告';
}

// ════════════════════════════════════════════════════════
//  寫入 Google Sheets
// ════════════════════════════════════════════════════════
function writeToSheet(items) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet  = ss.getSheetByName(SHEET_NAME);

  // 若工作表不存在，建立並寫標題列
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([['日期', '標題', '內容/連結', '類型']]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // 排序：升學 > 活動 > 公告；有日期 > 無日期；日期新 > 舊
  items.sort((a, b) => {
    const score = x => (x.type === '升學資訊' ? 2 : x.type === '全校活動' ? 1 : 0);
    if (score(b) !== score(a)) return score(b) - score(a);
    return (b.date || '').localeCompare(a.date || '');
  });

  // 清除舊資料（保留標題列）
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();

  // 寫入新資料
  if (items.length === 0) {
    Logger.log('沒有解析到任何資料');
    return;
  }

  const rows = items.slice(0, MAX_ITEMS).map(item => [
    item.date,
    item.title,
    item.content,
    item.type,
  ]);

  sheet.getRange(2, 1, rows.length, 4).setValues(rows);

  // 記錄更新時間（F1 儲存格）
  sheet.getRange(1, 6).setValue('更新時間：' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm'));

  Logger.log(`成功寫入 ${rows.length} 筆到「${SHEET_NAME}」工作表`);
}

// ════════════════════════════════════════════════════════
//  自動清理：刪除超過 60 天且與行事曆無關的舊訊息
//  欄位格式（第一張工作表）：
//    A: 時間  B: App來源  C: 發送者  D: 內容  E: 狀態
// ════════════════════════════════════════════════════════
function cleanOldMessages() {
  const ss        = SpreadsheetApp.openById('1ZzzX4BycbW3PW88RT1iDeZ3rdqvjISvowok9ALVWG2U');
  const msgSheet  = ss.getSheets()[0];              // 第一張工作表（訊息）
  const calSheet  = ss.getSheetByName(SHEET_NAME);  // 校網資料（含行事曆日期）

  const now      = new Date();
  const cutoff   = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 天前

  // ── 讀取校網資料中的所有日期，建立「未來 / 近期」日期集合 ──
  // 如果訊息內容包含這些日期，視為「有關聯行程」，不刪除
  const linkedDates = new Set();
  if (calSheet) {
    const calData = calSheet.getDataRange().getValues();
    for (let i = 1; i < calData.length; i++) {
      const raw = String(calData[i][0]).trim(); // A欄：日期
      if (raw) linkedDates.add(raw.slice(0, 10)); // 只取 YYYY-MM-DD 部分
    }
  }

  // ── 解析訊息內容中是否含有「未來日期」參照 ──
  function hasLinkedDate(content) {
    const text = String(content);
    // 檢查 YYYY-MM-DD 或 YYYY/MM/DD 格式
    const isoMatches = text.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g) || [];
    for (const m of isoMatches) {
      const key = m.replace(/\//g, '-');
      if (linkedDates.has(key)) return true;
      const d = new Date(key);
      if (!isNaN(d.getTime()) && d >= now) return true; // 未來日期
    }
    // 檢查「X月X日」格式
    const cnMatches = text.match(/(\d{1,2})月(\d{1,2})[日號]?/g) || [];
    for (const m of cnMatches) {
      const parts = m.match(/(\d{1,2})月(\d{1,2})/);
      if (!parts) continue;
      const d = new Date(now.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      if (d >= now) return true; // 未來日期
    }
    return false;
  }

  // ── 讀取所有訊息（從第2列開始）──
  const lastRow = msgSheet.getLastRow();
  if (lastRow < 2) { Logger.log('訊息工作表無資料'); return; }

  const data = msgSheet.getRange(2, 1, lastRow - 1, 5).getValues();

  // 清理順序：Gmail → LINE → Threads → X → Instagram
  const APP_ORDER = ['Gmail', 'LINE', 'Threads', 'X', 'Instagram'];

  // 找出「要刪除」的列（index 為相對 data 陣列的索引）
  // 依 App 順序分組收集，然後依序刪除（從最後一列往前刪，避免位移）
  const toDelete = {}; // { appName: [rowIndex1, rowIndex2, ...] }
  APP_ORDER.forEach(a => toDelete[a] = []);
  const otherDelete = [];

  for (let i = 0; i < data.length; i++) {
    const row      = data[i];
    const timeRaw  = String(row[0]).trim();
    const app      = String(row[1]).trim();
    const content  = String(row[3]).trim();

    // 解析時間戳
    let ts = new Date(timeRaw).getTime();
    if (isNaN(ts)) {
      // 嘗試中文格式 YYYY/M/D 上午/下午 H:MM:SS
      const m = timeRaw.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*(上午|下午)?\s*(\d{1,2}):(\d{2})/);
      if (m) {
        let h = parseInt(m[5]);
        if (m[4] === '下午' && h < 12) h += 12;
        if (m[4] === '上午' && h === 12) h = 0;
        ts = new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), h, parseInt(m[6])).getTime();
      }
    }

    if (isNaN(ts)) continue;            // 無法解析時間 → 保留
    if (ts >= cutoff.getTime()) continue; // 未超過 60 天 → 保留
    if (hasLinkedDate(content)) continue; // 有關聯行程 → 保留

    // 超過 60 天且無關聯 → 標記刪除
    const sheetRow = i + 2; // 實際列號（+2：標題列 + 1-based）
    if (toDelete[app] !== undefined) {
      toDelete[app].push(sheetRow);
    } else {
      otherDelete.push(sheetRow);
    }
  }

  // ── 依順序刪除（從後往前避免列號偏移）──
  let deleted = 0;
  const allToDelete = [
    ...toDelete['Gmail'],
    ...toDelete['LINE'],
    ...toDelete['Threads'],
    ...toDelete['X'],
    ...toDelete['Instagram'],
    ...otherDelete,
  ].sort((a, b) => b - a); // 從大到小（從最後一列往前刪）

  for (const row of allToDelete) {
    msgSheet.deleteRow(row);
    deleted++;
  }

  Logger.log(`訊息清理完成：共刪除 ${deleted} 筆超過 60 天且無行程關聯的訊息`);
  Logger.log(`  Gmail: ${toDelete['Gmail'].length} 筆`);
  Logger.log(`  LINE: ${toDelete['LINE'].length} 筆`);
  Logger.log(`  Threads: ${toDelete['Threads'].length} 筆`);
  Logger.log(`  X: ${toDelete['X'].length} 筆`);
  Logger.log(`  Instagram: ${toDelete['Instagram'].length} 筆`);
}

// ════════════════════════════════════════════════════════
//  設定每日自動觸發（執行一次即可）
// ════════════════════════════════════════════════════════
function setupTrigger() {
  // 刪除所有舊的相關觸發器，避免重複
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'fetchAndSaveSchoolData' || fn === 'cleanOldMessages') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 每天 07:00 抓取校網資料
  ScriptApp.newTrigger('fetchAndSaveSchoolData')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();

  // 每天 08:00 清理舊訊息
  ScriptApp.newTrigger('cleanOldMessages')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();

  Logger.log('觸發器設定完成：');
  Logger.log('  每天 07:00 → fetchAndSaveSchoolData');
  Logger.log('  每天 08:00 → cleanOldMessages');
}

// ════════════════════════════════════════════════════════
//  手動測試用
// ════════════════════════════════════════════════════════
function testRun() {
  fetchAndSaveSchoolData();
}

function testClean() {
  cleanOldMessages();
}
