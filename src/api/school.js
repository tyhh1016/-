/**
 * 鳳新高中校網公告爬取
 * 透過 allorigins.win CORS proxy 抓取學校網站 HTML 並解析公告清單
 */

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export const fetchSchoolNews = async (schoolUrl) => {
  try {
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(schoolUrl)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    return parseNews(html, schoolUrl);
  } catch (err) {
    console.warn('[SchoolAPI] 無法取得校網資料:', err.message);
    return [];
  }
};

const parseNews = (html, baseUrl) => {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const news = [];

  // 台灣學校網站常見的公告區塊選擇器（依優先序嘗試）
  const selectors = [
    '.news_list a',
    '.announce_list a',
    '.bulletin a',
    '#news a',
    '#announce a',
    '.news a',
    'td a[href*="news"]',
    'td a[href*="bulletin"]',
    'td a[href*="announce"]',
    'li a',
    'a',
  ];

  for (const sel of selectors) {
    const links = [...doc.querySelectorAll(sel)].filter(a => {
      const t = a.textContent.trim();
      return t.length >= 6 && t.length <= 80;       // 合理的標題長度
    });

    if (links.length >= 3) {
      links.slice(0, 8).forEach((a, i) => {
        const href = a.getAttribute('href') || '';
        const url  = href.startsWith('http')
          ? href
          : new URL(href, baseUrl).href;

        // 嘗試取得日期（鄰近的 td 或 span）
        const row  = a.closest('tr');
        const dateEl = row?.querySelector('td:first-child') || a.previousElementSibling;
        const date = dateEl?.textContent.trim().match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/)?.[0] ?? '';

        news.push({
          id:    `school_${i}`,
          title: a.textContent.trim(),
          url,
          date,
          tag:   '校網公告',
          source: 'school',
        });
      });
      if (news.length >= 3) break;
    }
  }

  return news;
};
