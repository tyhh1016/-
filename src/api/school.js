/**
 * 鳳新高中校網公告爬取（https://www.fhsh.khc.edu.tw/）
 *
 * 策略：
 *  1. 優先用 allorigins.win?get=（回傳 JSON，不易被截斷）
 *  2. 備援 corsproxy.io / codetabs
 *  3. 嘗試主頁及已知的高雄市學校 CMS 子頁
 *  4. 廣泛選擇器覆蓋各式台灣學校 CMS
 */

// ── proxy 函式列表 ──────────────────────────────────
// fn(url) → 回傳 { html: string } 或拋出錯誤
const PROXIES = [
  // allorigins JSON 模式（穩定，回傳 { contents, status }）
  async (url) => {
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(14000) }
    );
    if (!res.ok) throw new Error(`allorigins ${res.status}`);
    const { contents, status } = await res.json();
    if (status?.http_code && status.http_code >= 400)
      throw new Error(`target ${status.http_code}`);
    return contents;
  },
  // allorigins raw 模式
  async (url) => {
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error(`allorigins-raw ${res.status}`);
    return res.text();
  },
  // corsproxy.io
  async (url) => {
    const res = await fetch(
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error(`corsproxy ${res.status}`);
    return res.text();
  },
  // codetabs
  async (url) => {
    const res = await fetch(
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error(`codetabs ${res.status}`);
    return res.text();
  },
  // thingproxy
  async (url) => {
    const res = await fetch(
      `https://thingproxy.freeboard.io/fetch/${url}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error(`thingproxy ${res.status}`);
    return res.text();
  },
];

// 依序嘗試所有 proxy，回傳第一個成功且有效的 HTML
const tryFetch = async (url) => {
  for (const proxyFn of PROXIES) {
    try {
      const html = await proxyFn(url);
      if (typeof html === 'string' && html.length > 200 && /<[a-z]/i.test(html)) {
        return html;
      }
    } catch (e) {
      console.warn('[SchoolAPI] proxy 失敗:', e.message);
    }
  }
  return null;
};

// ── 升學 / 活動關鍵字 ────────────────────────────────
const EXAM_KW = /升學|學測|指考|申請入學|繁星|甄試|備審|大學|推薦|分科|選填|志願|錄取|面試|術科|統測|備審資料|個人申請|考試院|入學|考招|學力鑑定/;
const EVENT_KW = /活動|運動會|畢業|典禮|競賽|比賽|校慶|社團|研習|演講|參觀|旅行|露營|歌唱|表演|音樂會|舞蹈|美展|科展|學藝|營隊|實習|家長日|懇親|說明會|親師/;

// ── 嘗試的目標 URL 列表 ─────────────────────────────
const buildUrlList = (base) => {
  const b = base.replace(/\/$/, '');
  return [
    b + '/',
    // 高雄市學校常見 CMS 公告路徑
    b + '/modules/news/',
    b + '/modules/tadnews/',
    b + '/modules/tad_discuss/',
    b + '/news/',
    b + '/bulletin/',
    b + '/announce/',
    b + '/page/index',
    // 教育局 Portal 常見路徑
    b + '/index.php?option=com_content&view=category&layout=blog&id=1',
  ];
};

export const fetchSchoolNews = async (schoolUrl) => {
  const urls = buildUrlList(schoolUrl);

  for (const url of urls) {
    try {
      const html = await tryFetch(url);
      if (!html) continue;

      const results = parseNews(html, url);
      if (results.length >= 2) {
        console.log(`[SchoolAPI] ✅ 成功 from ${url}，共 ${results.length} 筆`);
        return results;
      }
      console.log(`[SchoolAPI] ⚠ ${url} 只解析到 ${results.length} 筆，繼續嘗試`);
    } catch (e) {
      console.warn(`[SchoolAPI] ❌ ${url}:`, e.message);
    }
  }

  console.warn('[SchoolAPI] 所有 URL/proxy 嘗試均失敗');
  return [];
};

// ── HTML 解析 ───────────────────────────────────────
const parseNews = (html, baseUrl) => {
  // 部分 proxy 可能回傳 escaped HTML，先 unescape
  const raw = html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const news = [];

  // ── 選擇器（由精確到廣泛）────────────────────────
  const SELECTORS = [
    // 高雄市 XOOPS / TadNews 模組
    '.tad_news_title a', '.tadnews_title a', '.news_title a',
    '#tadnews a', '#tad_news a',
    // 常見教育局 CMS
    '.news_list a', '.announce_list a', '.bulletin_list a',
    '#news_list a', '#announce_list a',
    '.kc_news a', '.list_news a',
    // 表格型
    'table.listT a', 'table.newslist a', 'table.list a',
    'table.bulletin a', 'table.announce a', 'table td a',
    // CSS class 含 news/bulletin
    '[class*="news"] a', '[class*="bulletin"] a', '[class*="announce"] a',
    // li 型
    'li.news a', 'li.item a', 'li.announce a', 'li a',
    // 兜底
    'a',
  ];

  // 過濾無意義連結
  const SKIP_TEXT = /^(首頁|回首頁|English|更多|more|回上頁|login|logout|search|網站地圖|sitemap|facebook|instagram|youtube|line|FB|IG|回頂端|top|選單|menu|:::)$/i;
  const SKIP_HREF = /^(#|javascript|mailto|tel)/i;

  for (const sel of SELECTORS) {
    const links = [...doc.querySelectorAll(sel)].filter(a => {
      const t = a.textContent.trim();
      if (t.length < 5 || t.length > 130) return false;
      if (SKIP_TEXT.test(t)) return false;
      const href = a.getAttribute('href') || '';
      if (!href || SKIP_HREF.test(href)) return false;
      return true;
    });

    if (links.length < 2) continue;

    const seen = new Set();
    for (const a of links.slice(0, 30)) {
      const title = a.textContent.trim();
      if (seen.has(title)) continue;
      seen.add(title);

      const href = a.getAttribute('href') || '';
      let url;
      try {
        url = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      } catch { continue; }

      // 嘗試抓日期
      const row    = a.closest('tr');
      const li     = a.closest('li');
      const parent = row || li || a.parentElement;

      const candidates = [
        row?.querySelector('td:first-child'),
        row?.querySelector('td:last-child'),
        li?.querySelector('time, .date, [class*="date"], [class*="time"]'),
        parent?.querySelector('time, .date, [class*="date"], [class*="time"], span'),
        a.previousElementSibling,
        a.nextElementSibling,
      ].filter(Boolean);

      let date = '';
      for (const el of candidates) {
        const t = el.textContent.trim();
        const m = t.match(/(\d{4}|\d{2,3})[-./年]\d{1,2}[-./月]\d{1,2}/);
        if (m) { date = m[0].replace(/[年月]/g, '-').replace(/日/g, ''); break; }
      }

      const isExam  = EXAM_KW.test(title);
      const isEvent = EVENT_KW.test(title);
      news.push({
        id:      `school_${news.length}_${Date.now()}`,
        title,
        url,
        date,
        tag:     isExam ? '升學資訊' : isEvent ? '全校活動' : '校網公告',
        isExam,
        isEvent,
        source:  'school',
      });
    }

    if (news.length >= 3) break;
  }

  // 升學 > 活動 > 其他；再依日期降序
  return news
    .sort((a, b) => {
      const s = x => (x.isExam ? 2 : x.isEvent ? 1 : 0);
      if (s(b) !== s(a)) return s(b) - s(a);
      return (b.date || '').localeCompare(a.date || '');
    })
    .slice(0, 15);
};
