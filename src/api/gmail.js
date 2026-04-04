/**
 * Gmail API v1 — 直接讀取收件匣郵件
 * 每則郵件回傳：寄件者、主旨、內文預覽（snippet，約 200 字）、gmailId（供懶載完整內文）
 */

// ── 工具函式 ──────────────────────────────────────────────

/** 將 base64url 解碼為 UTF-8 字串 */
const decodeBase64Url = (data) => {
  try {
    const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return ''; }
};

/** 將 HTML 轉為可讀純文字 */
const stripHtml = (html) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** 遞迴從 MIME payload 提取純文字（優先 text/plain，次選 text/html → 去 HTML 標籤） */
const extractText = (payload) => {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return decodeBase64Url(payload.body.data);
  if (payload.mimeType === 'text/html' && payload.body?.data)
    return stripHtml(decodeBase64Url(payload.body.data));
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html  = payload.parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data)  return stripHtml(decodeBase64Url(html.body.data));
    for (const part of payload.parts) {
      const t = extractText(part);
      if (t) return t;
    }
  }
  return '';
};

const parseSenderName = (from) => {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? from).trim();
};

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr);
    if (Date.now() - d.getTime() < 86_400_000)
      return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return ''; }
};

// ── 主要匯出 ─────────────────────────────────────────────

// 排除的寄件者 domain / 地址（自動化通知、系統郵件）
// Gmail API 的 -from: 語法：在 q 參數中加 -from:domain 即可排除
const EXCLUDED_SENDERS = [
  'notifications@github.com',
  'noreply@github.com',
  'no-reply@accounts.google.com',
  'no-reply@google.com',
  'googleplay-noreply@google.com',
].map(s => `-from:${s}`).join(' ');

const GMAIL_QUERY = `in:inbox ${EXCLUDED_SENDERS}`;

/**
 * 抓取收件匣最新 25 封郵件（metadata + snippet），排除系統通知
 * 不抓完整內文 → 速度快，供列表顯示用
 */
export const fetchGmailMessages = async (token) => {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(GMAIL_QUERY)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (listRes.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);

  const { messages = [] } = await listRes.json();
  if (!messages.length) return [];

  // 批次取得標頭 + snippet（format=metadata 已包含 Message.snippet 欄位）
  const details = await Promise.all(
    messages.map(({ id }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
        `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json())
    )
  );

  return details
    .filter(d => d.id)
    .map(detail => {
      const h       = detail.payload?.headers || [];
      const get     = name => h.find(x => x.name === name)?.value ?? '';
      const rawDate = get('Date');
      // snippet 已是解碼後純文字，僅含部分 HTML 實體 → 簡單清理
      const preview = (detail.snippet || '').replace(/&#\d+;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        id:          `gmail_${detail.id}`,
        gmailId:     detail.id,      // 原始 Gmail ID，供 fetchGmailBody 懶載入使用
        app:         'Gmail',
        sender:      parseSenderName(get('From')),
        content:     get('Subject') || '（無主旨）',
        bodyPreview: preview,        // 列表顯示用預覽（約 200 字）
        time:        formatDate(rawDate),
        ts:          new Date(rawDate).getTime() || 0,
        status:      detail.labelIds?.includes('UNREAD') ? 'new' : 'read',
        source:      'gmail',
      };
    });
};

/**
 * 懶載入完整郵件內文（點擊後才呼叫，避免批次抓大量郵件正文拖慢速度）
 */
export const fetchGmailBody = async (token, gmailId) => {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Gmail body ${res.status}`);
  const msg = await res.json();
  return extractText(msg.payload) || msg.snippet || '';
};
