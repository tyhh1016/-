/**
 * Gmail API v1
 * 抓取來自 Google Classroom 及學校相關的郵件
 */

// 搜尋條件：Google Classroom 通知 或 含作業/截止相關關鍵字的郵件
const QUERY = [
  'from:classroom.google.com',
  'from:noreply-driveshare@google.com',
  'subject:作業',
  'subject:截止',
  'subject:繳交',
  'subject:課程',
  'subject:公告',
].join(' OR ');

export const fetchGmailMessages = async (token) => {
  // 1. 取得訊息 ID 清單
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(QUERY)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (listRes.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);

  const { messages = [] } = await listRes.json();
  if (!messages.length) return [];

  // 2. 批次取得標頭（Subject / From / Date）
  const details = await Promise.all(
    messages.slice(0, 10).map(({ id }) =>
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
      const h    = detail.payload?.headers || [];
      const get  = name => h.find(x => x.name === name)?.value ?? '';
      const from = get('From');

      return {
        id:      `gmail_${detail.id}`,
        app:     'Gmail',
        sender:  parseSenderName(from),
        content: get('Subject') || '（無主旨）',
        time:    formatDate(get('Date')),
        status:  detail.labelIds?.includes('UNREAD') ? 'new' : 'read',
        source:  'gmail',
      };
    });
};

const parseSenderName = (from) => {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? from).trim();
};

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 86_400_000) {
      return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
};
