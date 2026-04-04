/**
 * Google Calendar API v3
 * 負責：建立/取得 SmartHub 專屬日曆、新增/更新/刪除行程
 * 時區：Asia/Taipei (UTC+8)
 */

const CALENDAR_NAME = 'SmartHub';
const TZ = 'Asia/Taipei';

// ── 來源標籤 ──────────────────────────────────────────
const SOURCE_LABEL = {
  gmail:   '來自 Gmail',
  sheets:  '來自 Google Sheets',
  line:    '來自 LINE',
  instagram: '來自 Instagram',
  x:       '來自 X',
  threads: '來自 Threads',
  school:  '來自鳳新校網',
  manual:  '手動新增',
  auto:    '自動解析',
};

function sourceLabel(event) {
  if (event.source === 'manual') return SOURCE_LABEL.manual;
  if (event.source === 'school') return SOURCE_LABEL.school;
  if (event.source === 'gmail')  return SOURCE_LABEL.gmail;
  if (event.source === 'sheets') {
    // 嘗試從 app 欄位細分
    const app = (event.app || '').toLowerCase();
    if (SOURCE_LABEL[app]) return SOURCE_LABEL[app];
    return SOURCE_LABEL.sheets;
  }
  // auto_ 前綴的自動解析行程
  return SOURCE_LABEL.auto;
}

// ── 將 SmartHub 事件轉換成 Google Calendar 事件格式 ──
function toGCalBody(event) {
  const desc = [
    sourceLabel(event),
    event.content && event.content !== event.title ? `\n內容：${event.content}` : '',
    event.url ? `\n來源連結：${event.url}` : '',
    `\n由 SmartHub 自動同步`,
  ].join('');

  // 有時間 → dateTime；無時間 → 全天 date
  if (event.time) {
    const startDt = `${event.date}T${event.time}:00+08:00`;
    // 結束時間預設 +1 小時
    const [h, m]  = event.time.split(':').map(Number);
    const endH    = String(h + 1 < 24 ? h + 1 : h).padStart(2, '0');
    const endDt   = `${event.date}T${endH}:${String(m).padStart(2,'0')}:00+08:00`;
    return {
      summary:     event.title,
      description: desc,
      start: { dateTime: startDt, timeZone: TZ },
      end:   { dateTime: endDt,   timeZone: TZ },
    };
  } else {
    // 全天行程：end.date 需要是隔天
    const d    = new Date(event.date + 'T00:00:00+08:00');
    d.setDate(d.getDate() + 1);
    const endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return {
      summary:     event.title,
      description: desc,
      start: { date: event.date },
      end:   { date: endDate },
    };
  }
}

// ── 取得或建立 SmartHub 日曆，回傳 calendarId ──────────
export async function getOrCreateSmartHubCalendar(token) {
  // 1. 列出所有日曆，尋找已存在的 SmartHub
  const listRes = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (listRes.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!listRes.ok) throw new Error(`CalendarList ${listRes.status}`);

  const { items = [] } = await listRes.json();
  const existing = items.find(c => c.summary === CALENDAR_NAME);
  if (existing) return existing.id;

  // 2. 不存在 → 建立新日曆
  const createRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: CALENDAR_NAME, timeZone: TZ }),
    }
  );
  if (!createRes.ok) throw new Error(`建立日曆失敗 ${createRes.status}`);

  const cal = await createRes.json();
  return cal.id;
}

// ── 在 Google Calendar 新增行程，回傳 gcalEventId ─────
export async function createGCalEvent(token, calendarId, event) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toGCalBody(event)),
    }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`建立行程失敗 ${res.status}`);

  const data = await res.json();
  return data.id; // Google Calendar 的事件 ID
}

// ── 更新 Google Calendar 上的行程 ─────────────────────
export async function updateGCalEvent(token, calendarId, gcalEventId, event) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEventId)}`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toGCalBody(event)),
    }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  // 404 代表該事件已在 Google Calendar 端被刪除，忽略
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`更新行程失敗 ${res.status}`);
}

// ── 刪除 Google Calendar 上的行程 ─────────────────────
export async function deleteGCalEvent(token, calendarId, gcalEventId) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEventId)}`,
    {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  // 404 / 410 代表已被刪除，忽略
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) throw new Error(`刪除行程失敗 ${res.status}`);
}

// ── 清空 SmartHub 日曆所有行程（重新同步用）─────────────
export async function clearAllGCalEvents(token, calendarId) {
  // 用 events.list 逐頁取得所有事件 ID，再逐一刪除
  let pageToken = null;
  const ids = [];

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set('maxResults', '250');
    url.searchParams.set('fields', 'nextPageToken,items(id)');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`列出行程失敗 ${res.status}`);

    const data = await res.json();
    (data.items || []).forEach(item => ids.push(item.id));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  // 逐一刪除
  for (const id of ids) {
    await deleteGCalEvent(token, calendarId, id);
  }
}
