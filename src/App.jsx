import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Inbox, Check, X, MessageSquare, Clock, School, Search,
  MoreHorizontal, Bell, BookOpen, Trophy, ChevronRight, ChevronLeft,
  Menu, X as Close, LogOut, RefreshCw, Loader2, AlertCircle,
  Plus, Pencil, Trash2, ExternalLink,
} from 'lucide-react';
import { GOOGLE_CLIENT_ID, SHEET_ID } from './config';
import { getStoredToken, requestAccessToken, clearToken, silentRefreshToken, getTokenExpiry } from './api/auth';
import { fetchSheetMessages } from './api/sheets';
import { fetchGmailMessages, fetchGmailBody } from './api/gmail';
import { fetchSchoolSheetData } from './api/schoolSheets'; // 從 Sheets 讀校網資料（由 Apps Script 定期更新）
import { getOrCreateSmartHubCalendar, createGCalEvent, updateGCalEvent, deleteGCalEvent, clearAllGCalEvents } from './api/gcal';

// ══════════════════════════════════════════════════
//  Utility: 日期物件 → 本地 "YYYY-MM-DD"（避免 toISOString UTC 偏移）
// ══════════════════════════════════════════════════
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ══════════════════════════════════════════════════
//  Utility: 從中文/混合文字解析日期
// ══════════════════════════════════════════════════
function parseDateFromText(text) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (/明天|明日/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return d;
  }
  if (/後天/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return d;
  }
  if (/大後天/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 3); return d;
  }

  // 下週X
  const nextWeekM = text.match(/下[週周]([一二三四五六日天])/);
  if (nextWeekM) {
    const dayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const target = dayMap[nextWeekM[1]];
    const d = new Date(today);
    const curr = d.getDay();
    let diff = (target - curr + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff + 7);
    return d;
  }

  // 本週/這週X
  const thisWeekM = text.match(/[本這][週周]([一二三四五六日天])/);
  if (thisWeekM) {
    const dayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const target = dayMap[thisWeekM[1]];
    const d = new Date(today);
    const curr = d.getDay();
    const diff = (target - curr + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  // X月X日/號
  const monthDayM = text.match(/(\d{1,2})月(\d{1,2})[日號]?/);
  if (monthDayM) {
    const d = new Date(today);
    d.setMonth(parseInt(monthDayM[1]) - 1, parseInt(monthDayM[2]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  // X/X（避免誤抓版本號）
  const slashM = text.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (slashM) {
    const d = new Date(today);
    d.setMonth(parseInt(slashM[1]) - 1, parseInt(slashM[2]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  return null;
}

// ══════════════════════════════════════════════════
//  Utility: 從文字解析時間 → "HH:MM"
// ══════════════════════════════════════════════════
function parseTimeFromText(text) {
  // HH:MM 或 HH：MM
  const colonM = text.match(/(\d{1,2})[：:](\d{2})/);
  if (colonM) {
    const h = parseInt(colonM[1]), m = parseInt(colonM[2]);
    if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const prefix = (text.match(/(下午|晚上|傍晚|上午|早上|凌晨)/) || [])[1] || '';

  // 中文數字時間（長到短避免部分匹配）
  const cnHours = [
    ['十二', 12], ['十一', 11], ['十', 10],
    ['九', 9], ['八', 8], ['七', 7], ['六', 6],
    ['五', 5], ['四', 4], ['三', 3], ['二', 2], ['一', 1],
  ];
  for (const [cn, num] of cnHours) {
    if (text.includes(cn + '點')) {
      let h = num;
      if ((prefix === '下午' || prefix === '晚上' || prefix === '傍晚') && h < 12) h += 12;
      if (prefix === '凌晨' && h === 12) h = 0;
      const half    = text.includes(cn + '點半');
      const minMatch = text.match(new RegExp(cn + '點(\\d+)分'));
      const m = minMatch ? parseInt(minMatch[1]) : (half ? 30 : 0);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // 數字 + 點：「下午3點」「3點半」
  const digitM = text.match(/(下午|晚上|上午|早上|凌晨)?(\d{1,2})點(半|(\d+)分)?/);
  if (digitM) {
    let h = parseInt(digitM[2]);
    if ((digitM[1] === '下午' || digitM[1] === '晚上') && h < 12) h += 12;
    if (digitM[1] === '凌晨' && h === 12) h = 0;
    const m = digitM[3] === '半' ? 30 : (digitM[4] ? parseInt(digitM[4]) : 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return '';
}

// ══════════════════════════════════════════════════
//  Utility: 從訊息 & 校網公告解析行事曆事件
// ══════════════════════════════════════════════════
function parseEventsFromData(messages, schoolNews) {
  const events = [];
  const today  = new Date(); today.setHours(0, 0, 0, 0);

  // 從訊息解析
  for (const msg of messages) {
    const text = msg.content || '';
    const date = parseDateFromText(text);
    if (!date) continue;

    const time       = parseTimeFromText(text);
    const isDeadline = /截止|deadline|due date|繳交|繳稿/i.test(text);
    const isClass    = /上課|課程|會議|meeting|見面|集合/i.test(text);

    events.push({
      id:      `auto_${msg.id}`,
      title:   text.length > 28 ? text.slice(0, 28) + '…' : text,
      date:    toLocalDateStr(date),   // 用本地日期，避免 UTC 偏移導致差一天
      time:    isDeadline && !time ? '23:59' : time,
      content: text,
      source:  msg.source || 'sheets',
      type:    isDeadline ? 'deadline' : isClass ? 'class' : 'event',
      color:   isDeadline ? 'orange' : msg.source === 'gmail' ? 'blue' : 'teal',
    });
  }

  // 從校網公告解析（需要有日期）
  for (const news of schoolNews) {
    if (!news.date) continue;
    const dateStr = news.date.replace(/[./]/g, '-');
    // 用本地時間建立，避免 new Date("YYYY-MM-DD") 解析成 UTC 導致時區偏移
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3) continue;
    const d = new Date(parts[0], parts[1] - 1, parts[2]); // 本地午夜
    if (isNaN(d.getTime()) || d < today) continue;

    const isExam = /升學|學測|指考|申請|繁星|甄試|備審|分科|選填/i.test(news.title);
    events.push({
      id:      `school_cal_${news.id}`,
      title:   news.title.length > 28 ? news.title.slice(0, 28) + '…' : news.title,
      date:    toLocalDateStr(d),
      time:    '',
      content: news.title,
      url:     news.url,
      source:  'school',
      type:    isExam ? 'exam' : 'event',
      color:   isExam ? 'purple' : 'green',
    });
  }

  return events;
}

// ══════════════════════════════════════════════════
//  Constants
// ══════════════════════════════════════════════════
const EV_STYLE = {
  orange: 'bg-orange-100 border border-orange-300 text-orange-800',
  blue:   'bg-blue-100 border border-blue-300 text-blue-800',
  teal:   'bg-teal-100 border border-teal-300 text-teal-800',
  green:  'bg-emerald-100 border border-emerald-300 text-emerald-800',
  purple: 'bg-purple-100 border border-purple-300 text-purple-800',
  red:    'bg-red-100 border border-red-300 text-red-800',
  manual: 'bg-indigo-100 border border-indigo-300 text-indigo-800',
};
const EV_DOT = {
  orange: 'bg-orange-400', blue: 'bg-blue-400', teal: 'bg-teal-400',
  green: 'bg-emerald-400', purple: 'bg-purple-500', red: 'bg-red-400', manual: 'bg-indigo-400',
};
const TYPE_LABEL  = { deadline: '截止日期', event: '活動', class: '課程', exam: '升學考試' };
const SRC_LABEL   = { gmail: 'Gmail', sheets: 'Google Sheets', school: '校網', manual: '手動新增' };
const DAYS_EN     = ['日', '一', '二', '三', '四', '五', '六'];
const CARD_COLORS = ['bg-yellow-50 border-yellow-100','bg-blue-50 border-blue-100','bg-purple-50 border-purple-100','bg-emerald-50 border-emerald-100','bg-orange-50 border-orange-100','bg-pink-50 border-pink-100'];
const CARD_ICONS  = [<Trophy size={20} className="text-yellow-500"/>,<BookOpen size={20} className="text-blue-500"/>,<Bell size={20} className="text-purple-500"/>,<School size={20} className="text-emerald-500"/>,<Calendar size={20} className="text-orange-500"/>,<Trophy size={20} className="text-pink-500"/>];

// ══════════════════════════════════════════════════
//  資料抓取 hook
// ══════════════════════════════════════════════════
const useData = (token, onTokenExpired) => {
  const [messages,   setMessages]   = useState([]);
  const [schoolNews, setSchoolNews] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // 兩個來源各自用 ref 存最新結果，互不干擾（polling 時只更新其中一個）
  const sheetMsgsRef = React.useRef([]);
  const gmailMsgsRef = React.useRef([]);

  // 合併兩個來源並寫入 React state
  const flushMessages = useCallback(() => {
    setMessages(
      [...sheetMsgsRef.current, ...gmailMsgsRef.current]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    );
  }, []);

  // 初始載入：同時抓三個來源
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [sheetRes, gmailRes, schoolRes] = await Promise.allSettled([
        SHEET_ID ? fetchSheetMessages(token, SHEET_ID) : Promise.resolve([]),
        fetchGmailMessages(token),
        SHEET_ID ? fetchSchoolSheetData(token, SHEET_ID) : Promise.resolve([]),
      ]);
      if (
        sheetRes.reason?.message === 'TOKEN_EXPIRED' ||
        gmailRes.reason?.message === 'TOKEN_EXPIRED' ||
        schoolRes.reason?.message === 'TOKEN_EXPIRED'
      ) { onTokenExpired(); return; }
      // 各自更新 ref，不覆蓋對方的資料
      if (sheetRes.status === 'fulfilled') sheetMsgsRef.current = sheetRes.value;
      if (gmailRes.status === 'fulfilled') gmailMsgsRef.current = gmailRes.value;
      if (sheetRes.status === 'fulfilled' || gmailRes.status === 'fulfilled') flushMessages();
      if (schoolRes.status === 'fulfilled') setSchoolNews(schoolRes.value);
      const errs = [sheetRes, gmailRes, schoolRes]
        .filter(r => r.status === 'rejected').map(r => r.reason?.message);
      if (errs.length) setError(`部分資料載入失敗：${errs.join('、')}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, onTokenExpired, flushMessages]);

  useEffect(() => { load(); }, [load]);

  // Sheets 輪詢：每 30 秒（LINE / Threads / Instagram 訊息即時更新）
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        sheetMsgsRef.current = await (SHEET_ID ? fetchSheetMessages(token, SHEET_ID) : Promise.resolve([]));
        flushMessages();
      } catch (e) { if (e.message === 'TOKEN_EXPIRED') onTokenExpired(); }
    };
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [token, onTokenExpired, flushMessages]);

  // Gmail 輪詢：每 5 分鐘（信件更新頻率較低，不需像訊息一樣頻繁）
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        gmailMsgsRef.current = await fetchGmailMessages(token);
        flushMessages();
      } catch (e) { if (e.message === 'TOKEN_EXPIRED') onTokenExpired(); }
    };
    const id = setInterval(poll, 5 * 60_000);
    return () => clearInterval(id);
  }, [token, onTokenExpired, flushMessages]);

  return { messages, schoolNews, loading, error, refresh: load };
};

// ══════════════════════════════════════════════════
//  LoginScreen
// ══════════════════════════════════════════════════
const LoginScreen = ({ onLogin }) => {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const handleLogin = async () => {
    if (!GOOGLE_CLIENT_ID) { setErr('請先在 .env 設定 VITE_GOOGLE_CLIENT_ID'); return; }
    setBusy(true); setErr('');
    try { await onLogin(); }
    catch (e) { setErr(e.message || '登入失敗，請再試一次'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center p-6">
      <div className="bg-white rounded-[40px] p-10 w-full max-w-sm shadow-2xl shadow-purple-900/30 text-center">
        <div className="w-16 h-16 bg-[#7C3AED] rounded-3xl flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-lg shadow-purple-300">S</div>
        <h1 className="text-2xl font-black text-slate-800 mb-2">SmartHub</h1>
        <p className="text-sm text-slate-400 font-medium mb-8">高三智慧整合平台</p>
        {err && <div className="flex items-center gap-2 bg-red-50 text-red-500 rounded-2xl px-4 py-3 text-xs font-bold mb-6"><AlertCircle size={14}/>{err}</div>}
        <button onClick={handleLogin} disabled={busy}
          className="w-full bg-[#7C3AED] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-purple-700 active:scale-95 transition-all shadow-lg shadow-purple-200 disabled:opacity-60">
          {busy ? <Loader2 size={18} className="animate-spin"/> : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" opacity=".8"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".8"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity=".8"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity=".8"/>
            </svg>
          )}
          使用 Google 帳號登入
        </button>
        <p className="text-[11px] text-slate-300 mt-5">需要 Gmail 及 Google Sheets 讀取權限</p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  EventDetailModal — 行程詳情彈窗
// ══════════════════════════════════════════════════
const EventDetailModal = ({ event, onClose, onEdit, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dotColor = EV_DOT[event.color] || 'bg-blue-400';

  const handleDelete = () => {
    if (confirmDelete) { onDelete(); }
    else { setConfirmDelete(true); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[28px] p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${dotColor}`}></span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {TYPE_LABEL[event.type] || event.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* 編輯：所有行程皆可 */}
            <button onClick={onEdit}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              title="編輯行程">
              <Pencil size={14}/>
            </button>
            {/* 刪除：點一次顯示確認文字，再點一次才刪除 */}
            <button onClick={handleDelete}
              className={`flex items-center gap-1 px-2 h-8 rounded-xl text-xs font-bold transition-colors
                ${confirmDelete ? 'bg-red-500 text-white hover:bg-red-600' : 'hover:bg-red-50 text-red-400'}`}
              title="刪除行程">
              <Trash2 size={14}/>
              {confirmDelete && <span>確認刪除</span>}
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X size={15}/></button>
          </div>
        </div>

        <h3 className="text-lg font-black text-slate-800 mb-4 leading-tight">{event.title}</h3>

        <div className="space-y-2.5 text-sm text-slate-600">
          <div className="flex items-center gap-2.5">
            <Calendar size={14} className="text-slate-400 shrink-0"/>
            <span>{event.date}{event.time ? `　${event.time}` : ''}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MessageSquare size={14} className="text-slate-400 shrink-0"/>
            <span>{SRC_LABEL[event.source] || event.source}</span>
          </div>
          {event.content && event.content !== event.title && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">
              {event.content}
            </div>
          )}
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer"
              className="inline-block text-purple-500 text-xs font-bold hover:underline mt-1">
              查看原文 →
            </a>
          )}
        </div>

        {event.source !== 'manual' && (
          <p className="text-[10px] text-slate-300 font-medium mt-4">
            自動解析行程：編輯後將另存為手動行程；刪除後不再顯示
          </p>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  EventFormModal — 新增 / 編輯行程
// ══════════════════════════════════════════════════
const EventFormModal = ({ initialDate, editEvent, onSave, onClose }) => {
  const [form, setForm] = useState({
    title:   editEvent?.title   || '',
    date:    editEvent?.date    || (initialDate ? initialDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    time:    editEvent?.time    || '',
    content: editEvent?.content || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim() || !form.date) return;
    // 非手動行程編輯時，產生新的 manual_ ID，避免與自動解析事件衝突
    const isManualEdit = editEvent?.id?.startsWith('manual_');
    onSave({
      id:            isManualEdit ? editEvent.id : `manual_${Date.now()}`,
      title:         form.title.trim(),
      date:          form.date,
      time:          form.time,
      content:       form.content.trim(),
      source:        'manual',
      type:          'event',
      color:         'manual',
      // 若是從自動解析行程編輯過來，同時隱藏原事件
      _hideSourceId: (!isManualEdit && editEvent?.id) ? editEvent.id : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[28px] p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-slate-800">{editEvent ? '編輯行程' : '新增行程'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><X size={15}/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">標題 *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="行程標題"
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">日期 *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full px-3 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-purple-400 transition-all"/>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">時間</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)}
                className="w-full px-3 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-purple-400 transition-all"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">備註</label>
            <textarea
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder="行程說明（選填）"
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-purple-400 resize-none transition-all"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}   className="flex-1 py-3 rounded-2xl bg-slate-50 text-slate-500 text-sm font-bold hover:bg-slate-100 transition-colors">取消</button>
          <button onClick={handleSave} disabled={!form.title.trim() || !form.date}
            className="flex-1 py-3 rounded-2xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50">
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  SmartCalendar — 智慧行事曆（週/月 切換）
// ══════════════════════════════════════════════════
const SmartCalendar = ({ events, onSaveEvent, onDeleteEvent }) => {
  const [view,          setView]          = useState('week');
  const [currentDate,   setCurrentDate]   = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null); // 詳情彈窗
  const [formState,     setFormState]     = useState(null); // { initialDate?, editEvent? } | null
  const [dayPopup,      setDayPopup]      = useState(null); // { date, events } 當天行程彈窗

  // 計算週日期（日～六，以週日為第一天）
  const getWeekDates = (date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day); // 回到週日
    return Array.from({ length: 7 }, (_, i) => {
      const nd = new Date(d); nd.setDate(d.getDate() + i); return nd;
    });
  };

  // 計算月份格（含前後補白，週日為第一欄）
  const getMonthDates = (date) => {
    const y = date.getFullYear(), m = date.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay  = new Date(y, m + 1, 0);
    const startOffset = firstDay.getDay(); // 0=Sun → 直接用，不再 -1
    const days = [];
    for (let i = startOffset; i > 0; i--) {
      const d = new Date(firstDay); d.setDate(d.getDate() - i);
      days.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(y, m, i), inMonth: true });
    }
    const remaining = (7 - days.length % 7) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay); d.setDate(d.getDate() + i);
      days.push({ date: d, inMonth: false });
    }
    return days;
  };

  const weekDates  = getWeekDates(currentDate);
  const monthDates = getMonthDates(currentDate);
  const isToday    = (date) => { const t = new Date(); t.setHours(0,0,0,0); return date.toDateString() === t.toDateString(); };

  const getEventsForDate = (date) => {
    // 使用本地日期字串，避免 toISOString() 轉 UTC 導致台灣時區差一天
    const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return events.filter(e => e.date === ds).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  };

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  const handleEdit   = (ev) => { setSelectedEvent(null); setFormState({ editEvent: ev }); };
  const handleDelete = (id) => { setSelectedEvent(null); onDeleteEvent(id); };

  // 行程方塊元件
  const EventBlock = ({ ev, compact }) => (
    <div
      onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
      title={ev.title}
      className={`rounded-lg cursor-pointer hover:shadow-md active:scale-95 transition-all
        ${compact ? 'px-1.5 py-1 text-[8px]' : 'p-1.5 text-[9px] md:text-[10px]'}
        ${EV_STYLE[ev.color] || EV_STYLE.blue} font-bold leading-tight`}
    >
      {ev.time && <span className="opacity-60 mr-0.5">{ev.time.slice(0,5)}</span>}
      <span className={compact ? 'truncate block' : 'line-clamp-2'}>{ev.title}</span>
    </div>
  );

  return (
    <div>
      {/* ── 工具列 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">智慧行事曆</h2>
          <button onClick={() => setCurrentDate(new Date())}
            className="text-xs text-purple-500 font-bold hover:text-purple-700 transition-colors">今天</button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold text-slate-600 min-w-[110px] text-center">
            {view === 'week'
              ? `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`
              : `${currentDate.getFullYear()} 年 ${currentDate.getMonth()+1} 月`}
          </span>
          <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ChevronRight size={16}/></button>
          <div className="flex gap-1 ml-1">
            {['week','month'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${view===v ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                {v === 'week' ? '週' : '月'}
              </button>
            ))}
          </div>
          <button onClick={() => setFormState({})}
            className="ml-1 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors">
            <Plus size={12}/> 新增
          </button>
        </div>
      </div>

      {/* ── 星期標題 ── */}
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {DAYS_EN.map(d => (
          <p key={d} className="text-center text-[10px] font-black tracking-tighter uppercase text-slate-300">{d}</p>
        ))}
      </div>

      {/* ── 週視圖 ── */}
      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((date, i) => {
            const dayEvs = getEventsForDate(date);
            return (
              <div key={i} onClick={() => setFormState({ initialDate: date })}
                className={`min-h-[150px] md:min-h-[200px] rounded-2xl border-2 p-1.5 cursor-pointer transition-colors
                  ${isToday(date) ? 'bg-purple-50/60 border-purple-200' : 'bg-slate-50/50 border-transparent hover:border-slate-200'}`}>
                {/* 日期數字 */}
                <div className={`w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-black mx-auto mb-1.5
                  ${isToday(date) ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                  {date.getDate()}
                </div>
                {/* 行程方塊 */}
                <div className="space-y-1" onClick={e => e.stopPropagation()}>
                  {dayEvs.slice(0, 4).map(ev => <EventBlock key={ev.id} ev={ev}/>)}
                  {dayEvs.length > 4 && (
                    <button onClick={e => { e.stopPropagation(); setDayPopup({ date, events: dayEvs }); }}
                      className="text-[8px] text-purple-500 font-bold text-center w-full hover:text-purple-700">
                      +{dayEvs.length-4} 更多…
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 月視圖 ── */}
      {view === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {monthDates.map(({ date, inMonth }, i) => {
            const dayEvs = getEventsForDate(date);
            return (
              <div key={i} onClick={() => setFormState({ initialDate: date })}
                className={`min-h-[72px] rounded-xl p-1 cursor-pointer transition-colors
                  ${isToday(date) ? 'bg-purple-50 ring-1 ring-purple-200' : inMonth ? 'bg-white/60 hover:bg-slate-50' : 'opacity-35'}`}>
                <div className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-md mb-1
                  ${isToday(date) ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5" onClick={e => e.stopPropagation()}>
                  {dayEvs.slice(0, 2).map(ev => <EventBlock key={ev.id} ev={ev} compact/>)}
                  {dayEvs.length > 2 && (
                    <button onClick={e => { e.stopPropagation(); setDayPopup({ date, events: dayEvs }); }}
                      className="text-[8px] text-purple-500 font-bold pl-1 hover:text-purple-700">
                      +{dayEvs.length-2} 更多
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 當天完整行程彈窗 ── */}
      {dayPopup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDayPopup(null)}>
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-800">
                {dayPopup.date.getMonth()+1}/{dayPopup.date.getDate()} 全部行程
              </h3>
              <button onClick={() => setDayPopup(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={16}/>
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {dayPopup.events.map(ev => (
                <div key={ev.id}
                  onClick={() => { setDayPopup(null); setSelectedEvent(ev); }}
                  className={`p-3 rounded-2xl cursor-pointer hover:opacity-80 transition-opacity ${EV_STYLE[ev.color] || EV_STYLE.blue}`}>
                  <div className="flex items-center gap-2">
                    {ev.time && <span className="text-[10px] font-bold opacity-60">{ev.time.slice(0,5)}</span>}
                    <span className="text-xs font-bold flex-1">{ev.title}</span>
                  </div>
                  {ev.desc && <p className="text-[10px] opacity-70 mt-1 truncate">{ev.desc}</p>}
                </div>
              ))}
            </div>
            <button onClick={() => { setDayPopup(null); setFormState({ initialDate: dayPopup.date }); }}
              className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors">
              <Plus size={12}/> 新增行程
            </button>
          </div>
        </div>
      )}

      {/* ── 行程詳情彈窗 ── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => handleEdit(selectedEvent)}
          onDelete={() => handleDelete(selectedEvent.id)}
        />
      )}

      {/* ── 新增/編輯彈窗 ── */}
      {formState !== null && (
        <EventFormModal
          initialDate={formState.initialDate}
          editEvent={formState.editEvent}
          onSave={onSaveEvent}
          onClose={() => setFormState(null)}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════
//  DashboardView
// ══════════════════════════════════════════════════
const DashboardView = ({ messages, schoolNews, dismissed, onDismiss, calendarEvents, onSaveEvent, onDeleteEvent }) => {
  const visiblePending   = messages.filter(m => m.status === 'pending' && !dismissed.has(m.id));
  const deadlineKw       = /作業|截止|繳交|deadline/i;
  const deadlineMsgs     = messages.filter(m => deadlineKw.test(m.content) && !dismissed.has(m.id));
  const recentNonPending = messages.filter(m => m.status !== 'pending').slice(0, 2);
  // statPopup 只儲存「類型」，items 每次 render 動態計算，確保與 dismissed 即時連動
  const [statPopupType, setStatPopupType] = useState(null); // 'messages' | 'pending' | 'deadlines' | 'school'

  const APP_COLOR = { Gmail:'bg-red-50 text-red-500', LINE:'bg-green-50 text-green-600', Instagram:'bg-pink-50 text-pink-500', X:'bg-slate-100 text-slate-600', Threads:'bg-slate-100 text-slate-700' };

  const msgToItem = (m) => ({
    msgId: m.id, badge: m.app, badgeColor: APP_COLOR[m.app] || 'bg-slate-100 text-slate-500',
    title: m.sender, sub: m.content?.slice(0, 80), time: m.time,
  });

  // 動態計算當前彈窗的 items（dismissed 每次更新都會反映）
  const popupConfig = {
    messages:  { title: '社交訊息',     icon: <MessageSquare className="text-purple-500" size={18}/>, dismissable: true,  empty: '尚無社交訊息',                    items: () => messages.filter(m => !dismissed.has(m.id)).slice(0, 30).map(msgToItem) },
    pending:   { title: '待確認擬稿',   icon: <Bell className="text-blue-500" size={18}/>,           dismissable: true,  empty: '目前沒有待確認的擬稿',             items: () => visiblePending.map(msgToItem) },
    deadlines: { title: '截止相關訊息', icon: <Calendar className="text-orange-500" size={18}/>,     dismissable: true,  empty: '目前無含截止關鍵字的訊息',         items: () => deadlineMsgs.map(msgToItem) },
    school:    { title: '校網公告',     icon: <School className="text-emerald-500" size={18}/>,      dismissable: false, empty: '尚無校網公告（請先執行 Apps Script）', items: () => schoolNews.slice(0, 30).map(n => ({
      badge: n.tag, badgeColor: n.isExam ? 'bg-purple-100 text-purple-600' : n.isEvent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500',
      title: n.title, sub: n.date, time: null, url: n.url,
    })) },
  };
  const statPopup = statPopupType ? { ...popupConfig[statPopupType], items: popupConfig[statPopupType].items() } : null;

  // 刪除訊息：只需更新 dismissed，popup items 會自動重算
  const handlePopupDismiss = (msgId) => { onDismiss(msgId); };

  return (
    <div className="space-y-8">
      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatBox icon={<MessageSquare className="text-purple-500"/>} label="社交訊息"
          value={`${messages.length} 則`}
          sub={messages.length ? `最新：${messages[0]?.sender}` : '尚無訊息'}
          onClick={() => setStatPopupType('messages')}/>
        <StatBox icon={<Bell className="text-blue-500"/>} label="待確認擬稿"
          value={`${visiblePending.length} 件`}
          sub={visiblePending.length ? `來自 ${visiblePending[0]?.app}` : '全部已確認'}
          onClick={() => setStatPopupType('pending')}/>
        <StatBox icon={<Calendar className="text-orange-500"/>} label="截止相關"
          value={`${deadlineMsgs.length} 件`}
          sub={deadlineMsgs.length ? '含作業/截止關鍵字' : '目前無截止通知'}
          onClick={() => setStatPopupType('deadlines')}/>
        <StatBox icon={<School className="text-emerald-500"/>} label="校網公告"
          value={`${schoolNews.length} 則`}
          sub={schoolNews.length ? schoolNews[0]?.title?.slice(0, 12) + '…' : '尚無公告'}
          onClick={() => setStatPopupType('school')}/>
      </div>

      {/* ── 統計卡片彈窗 ── */}
      {statPopup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setStatPopupType(null)}>
          <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}>
            {/* 標題列 */}
            <div className="flex items-center justify-between p-6 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                {statPopup.icon}
                <h3 className="text-base font-black text-slate-800">{statPopup.title}</h3>
                <span className="text-xs font-bold text-slate-300">{statPopup.items.length} 筆</span>
              </div>
              <button onClick={() => setStatPopupType(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={16}/>
              </button>
            </div>
            {/* 清單 */}
            <div className="overflow-y-auto px-6 pb-6 space-y-2">
              {statPopup.items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">{statPopup.empty}</p>
              )}
              {statPopup.items.map((item, i) => {
                const cardContent = (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {item.badge && (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${item.badgeColor}`}>{item.badge}</span>
                      )}
                      <span className="text-xs font-bold text-slate-700">{item.title}</span>
                      {item.time && <span className="text-[9px] text-slate-300 font-medium ml-auto shrink-0">{item.time}</span>}
                    </div>
                    {item.sub && <p className="text-[11px] text-slate-400 leading-relaxed">{item.sub}</p>}
                  </div>
                );
                const wrapper = (inner) => item.url
                  ? <a key={i} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all cursor-pointer">{inner}</a>
                  : <div key={i} className="flex items-start gap-2 p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">{inner}</div>;
                return wrapper(
                  <>
                    {cardContent}
                    {statPopup.dismissable && item.msgId && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePopupDismiss(item.msgId); }}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                        title="刪除此訊息">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* ── 行事曆 + 擬稿 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 智慧行事曆 */}
        <div className="lg:col-span-8 bg-white rounded-[40px] p-6 md:p-10 shadow-sm border border-slate-100/50">
          <SmartCalendar
            events={calendarEvents}
            onSaveEvent={onSaveEvent}
            onDeleteEvent={onDeleteEvent}
          />
        </div>

        {/* 待審核擬稿 */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800">待審核擬稿</h2>
            <MoreHorizontal size={20} className="text-slate-300"/>
          </div>

          {visiblePending.map(msg => (
            <div key={msg.id} className="bg-white p-6 rounded-[32px] shadow-xl shadow-slate-200/40 border border-white hover:border-purple-100 transition-all">
              <div className="flex justify-between mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${msg.app==='Gmail' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                  {msg.app} 偵測
                </span>
                <span className="text-[10px] font-bold text-slate-300">{msg.time}</span>
              </div>
              <div className="mb-4">
                <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">{msg.sender}</p>
                <p className="text-sm font-bold text-slate-700 leading-relaxed italic">「{msg.content}」</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onDismiss(msg.id)} className="flex-1 bg-emerald-500 text-white py-3.5 rounded-2xl flex items-center justify-center hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all active:scale-95">
                  <Check size={22} strokeWidth={3}/>
                </button>
                <button onClick={() => onDismiss(msg.id)} className="flex-1 bg-slate-50 text-slate-400 py-3.5 rounded-2xl flex items-center justify-center hover:bg-slate-100 transition-all active:scale-95">
                  <X size={22} strokeWidth={3}/>
                </button>
              </div>
            </div>
          ))}

          {visiblePending.length === 0 && (
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-50 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-bold text-slate-400">所有擬稿已確認</p>
            </div>
          )}

          <div className="p-2">
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-6">今日訊息流</h3>
            <div className="space-y-5">
              {recentNonPending.length === 0 && (
                <p className="text-[11px] text-slate-300 font-medium">尚無已讀訊息</p>
              )}
              {recentNonPending.map(m => (
                <div key={m.id} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center shadow-sm font-bold text-xs shrink-0">{m.app[0]}</div>
                  <div className="flex-1 min-w-0 border-b border-slate-50 pb-4">
                    <div className="flex justify-between mb-1">
                      <p className="text-xs font-black text-slate-700">{m.sender}</p>
                      <span className="text-[9px] text-slate-300 font-bold">{m.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  InboxView
// ══════════════════════════════════════════════════
const APP_COLOR = {
  Gmail:     'bg-red-50 text-red-500',
  LINE:      'bg-green-50 text-green-600',
  Threads:   'bg-slate-100 text-slate-700',
  Instagram: 'bg-pink-50 text-pink-500',
};
const APP_FILTERS = ['all', 'Gmail', 'LINE', 'Threads', 'Instagram'];
const APP_LABELS  = { all: '全部' };

/**
 * 將訊息的 app 欄位統一對映到篩選按鈕所用的標準名稱（完全符合比對用）。
 * 在 filter 時呼叫，雙重保障：即使資料在 sheets.js normalizeApp 之前就已存入記憶體，
 * 比對結果仍然正確。
 * 規則：只做「已知平台 → 標準名稱」的一對一轉換，不做子字串包含比對。
 */
const toCanonicalApp = (raw) => {
  if (!raw) return '';
  const a = raw.trim().toLowerCase();
  if (a === 'gmail')                                       return 'Gmail';
  if (a === 'line')                                        return 'LINE';
  if (a === 'instagram' || a === 'ig')                     return 'Instagram';
  if (a === 'threads')                                     return 'Threads';
  // 其他未知值原樣回傳（已 trim），不會意外匹配任何篩選分類
  return raw.trim();
};

const InboxView = ({ messages, searchQuery, onFetchBody }) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [appFilter,    setAppFilter]    = useState('all');
  const [expandedId,   setExpandedId]   = useState(null);   // 目前展開的 Gmail 訊息 ID
  const [bodyCache,    setBodyCache]    = useState({});      // id → 完整內文字串
  const [bodyLoading,  setBodyLoading]  = useState(new Set()); // 正在載入的 id 集合

  // 點擊 Gmail 訊息 → 展開/收起完整內文（懶載入）
  const handleMsgClick = async (msg) => {
    if (msg.source !== 'gmail') return;
    if (expandedId === msg.id) { setExpandedId(null); return; }
    setExpandedId(msg.id);
    if (bodyCache[msg.id] || !onFetchBody) return; // 已快取則直接展示
    setBodyLoading(prev => new Set([...prev, msg.id]));
    try {
      const body = await onFetchBody(msg.gmailId);
      setBodyCache(prev => ({ ...prev, [msg.id]: body }));
    } catch {
      setBodyCache(prev => ({ ...prev, [msg.id]: msg.bodyPreview || '（無法載入郵件內容）' }));
    } finally {
      setBodyLoading(prev => { const s = new Set(prev); s.delete(msg.id); return s; });
    }
  };

  // 切換 app 分類時同步重置狀態篩選，確保不殘留上一個分類的條件
  const handleAppFilterChange = (app) => {
    setAppFilter(app);
    setStatusFilter('all');
  };

  const q = (searchQuery || '').toLowerCase().trim();

  const filtered = messages
    .filter(m => {
      // ── App 來源篩選（優先，決定訊息歸屬）────────────────
      if (appFilter !== 'all') {
        if (appFilter === 'Gmail') {
          // Gmail 分類：只顯示 Gmail API 直接抓到的郵件（source 欄位為 'gmail'）。
          // Google Sheets B 欄即使填了 'Gmail' 也不屬於此分類，以防交叉污染。
          if (m.source !== 'gmail') return false;
        } else {
          // LINE / X / Instagram / Threads：只顯示 Sheets 來源的訊息。
          if (m.source !== 'sheets') return false;
          // 在 filter 時呼叫 toCanonicalApp，雙重保障正規化，
          // 確保 'twitter'/'Twitter/X'/'x' 等變體全部映射到 'X'，
          // 而不會意外出現在 LINE / Threads / Instagram 分類中。
          if (toCanonicalApp(m.app) !== appFilter) return false;
        }
      }

      // ── 狀態篩選 ──────────────────────────────────────────
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;

      // ── 搜尋篩選（只比對內容與寄件者）────────────────────
      if (q && !(
        m.content?.toLowerCase().includes(q) ||
        m.sender?.toLowerCase().includes(q)
      )) return false;

      return true;
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-800">訊息收件匣</h2>
        {q && (
          <span className="text-xs text-purple-600 font-bold bg-purple-50 px-3 py-1.5 rounded-xl">
            搜尋「{searchQuery}」— {filtered.length} 筆結果
          </span>
        )}
      </div>

      {/* 狀態篩選列 */}
      <div className="flex gap-2 flex-wrap">
        {[['all','全部'],['pending','待確認'],['new','最新'],['read','已讀']].map(([val, label]) => (
          <button key={val} onClick={() => setStatusFilter(val)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${statusFilter===val ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* App 分類篩選列 */}
      <div className="flex gap-2 flex-wrap">
        {APP_FILTERS.map(app => (
          <button key={app} onClick={() => handleAppFilterChange(app)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${appFilter===app
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
            {APP_LABELS[app] || app}
          </button>
        ))}
      </div>

      {/* 訊息列表 */}
      <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100/50">
        {filtered.map((msg, i) => {
          const isGmail    = msg.source === 'gmail';
          const isExpanded = expandedId === msg.id;
          const isLoading  = bodyLoading.has(msg.id);
          return (
            <div key={msg.id}
              onClick={() => handleMsgClick(msg)}
              className={`flex items-start gap-5 px-6 md:px-8 py-6 hover:bg-slate-50 transition-colors
                ${isGmail ? 'cursor-pointer' : ''}
                ${i !== filtered.length-1 ? 'border-b border-slate-50' : ''}`}>

              {/* 頭像（app 名稱首字母） */}
              <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-500 shrink-0 text-sm">
                {(msg.app || '?')[0]}
              </div>

              <div className="flex-1 min-w-0">
                {/* 寄件者 + 來源標籤 + 時間 */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-slate-800">{msg.sender}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase
                      ${APP_COLOR[msg.app] ?? 'bg-slate-100 text-slate-500'}`}>
                      {msg.app}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-300 font-bold shrink-0 ml-2">{msg.time}</span>
                </div>

                {/* 主旨 */}
                <p className="text-sm text-slate-600 leading-relaxed">{msg.content}</p>

                {/* Gmail 內文預覽（未展開時顯示前 200 字） */}
                {isGmail && msg.bodyPreview && !isExpanded && (
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                    {msg.bodyPreview.slice(0, 200)}
                  </p>
                )}

                {/* Gmail 完整內文（展開後顯示） */}
                {isGmail && isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {isLoading
                      ? <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                          <Loader2 size={12} className="animate-spin"/> 載入郵件內文…
                        </div>
                      : <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {bodyCache[msg.id] || msg.bodyPreview}
                        </p>
                    }
                    <button
                      className="mt-2 text-[11px] font-bold text-purple-500 hover:text-purple-700 transition-colors"
                      onClick={e => { e.stopPropagation(); setExpandedId(null); }}>
                      收起 ▲
                    </button>
                  </div>
                )}
              </div>

              {/* 狀態指示點 */}
              <div className="shrink-0 flex items-center pt-1">
                {msg.status === 'pending' && <span className="w-2.5 h-2.5 bg-purple-500 rounded-full"></span>}
                {msg.status === 'new'     && <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm font-bold">
            {q ? `找不到符合「${searchQuery}」的訊息` : '此分類沒有訊息'}
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  SchoolView
// ══════════════════════════════════════════════════
const SchoolView = ({ schoolNews, messages, calendarEvents, onSaveEvent, onDeleteEvent, searchQuery, dismissed, onDismiss }) => {
  const deadlineKw = /作業|截止|繳交|deadline/i;
  const deadlines  = messages.filter(m => deadlineKw.test(m.content) && !dismissed?.has(m.id)).slice(0, 6);
  const examDate   = new Date('2026-01-17');
  const daysLeft   = Math.max(0, Math.ceil((examDate - Date.now()) / 86_400_000));

  // 搜尋過濾
  const q = (searchQuery || '').toLowerCase().trim();
  const filteredNews = q
    ? schoolNews.filter(n =>
        n.title?.toLowerCase().includes(q) ||
        n.tag?.toLowerCase().includes(q) ||
        n.date?.includes(q)
      )
    : schoolNews;

  // 升學 & 活動公告分組
  const examNews   = filteredNews.filter(n => n.isExam);
  const eventNews  = filteredNews.filter(n => n.isEvent && !n.isExam);
  const otherNews  = filteredNews.filter(n => !n.isExam && !n.isEvent);
  const orderedNews = [...examNews, ...eventNews, ...otherNews];

  // 判斷是否為有意義的外部連結
  // 只過濾掉：(1) 指回 SmartHub 自身的連結  (2) Google Calendar 行事曆連結（不含具體內容）
  const isRealLink = (url) => {
    if (!url || !url.startsWith('http')) return false;
    try {
      const u = new URL(url);
      // 指回 SmartHub 本身（localhost 或部署網域）→ 過濾
      if (u.origin === window.location.origin) return false;
      // Google Calendar 嵌入連結 → 不是校網內容頁
      if (u.hostname.includes('calendar.google.com')) return false;
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-2xl font-black text-slate-800">校園公告 &amp; 升學資訊</h2>
            <div className="flex items-center gap-3">
              {q && (
                <span className="text-xs text-purple-600 font-bold bg-purple-50 px-3 py-1.5 rounded-xl">
                  搜尋「{searchQuery}」— {orderedNews.length} 筆結果
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium">來源：鳳新高中校網</span>
            </div>
          </div>
          {orderedNews.length === 0 && (
            <div className="bg-white rounded-[28px] p-10 text-center border border-slate-100">
              <p className="text-3xl mb-3">🏫</p>
              <p className="text-sm font-bold text-slate-400">
                {q ? `找不到符合「${searchQuery}」的公告` : '尚無校網公告資料'}
              </p>
              {!q && <p className="text-xs text-slate-300 mt-1">請先執行 Apps Script 抓取校網資料</p>}
            </div>
          )}
          {orderedNews.map((n, i) => {
            const hasLink = isRealLink(n.url);
            const cardClass = `bg-white p-6 md:p-7 rounded-[28px] border ${CARD_COLORS[i % CARD_COLORS.length]} transition-all group`;
            const inner = (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm shrink-0">
                  {CARD_ICONS[i % CARD_ICONS.length]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full
                      ${n.isExam ? 'bg-purple-100 text-purple-600' : n.isEvent ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400'}`}>
                      {n.tag}
                    </span>
                    {n.date && <span className="text-[10px] font-bold text-slate-300">{n.date}</span>}
                    {hasLink && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                        <ExternalLink size={9} />外部連結
                      </span>
                    )}
                  </div>
                  <p className={`text-base font-black text-slate-800 mb-1 ${hasLink ? 'group-hover:text-purple-700' : ''} transition-colors`}>{n.title}</p>
                </div>
                {hasLink
                  ? <ExternalLink size={16} className="text-slate-200 group-hover:text-purple-400 transition-colors shrink-0 mt-1"/>
                  : <span className="w-4 shrink-0"/>
                }
              </div>
            );
            return hasLink
              ? <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className={`block ${cardClass} hover:shadow-lg`}>{inner}</a>
              : <div key={n.id} className={cardClass}>{inner}</div>;
          })}

          {/* 校網行事曆事件（有日期的） */}
          {calendarEvents.filter(e => e.source === 'school').length > 0 && (
            <div className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100/50">
              <SmartCalendar
                events={calendarEvents}
                onSaveEvent={onSaveEvent}
                onDeleteEvent={onDeleteEvent}
              />
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          {deadlines.length > 0 && (
            <>
              <h2 className="text-xl font-black text-slate-800">截止相關訊息</h2>
              <div className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100/50 space-y-1">
                {deadlines.map((m, i) => (
                  <div key={m.id} className={`flex items-start gap-3 py-3 ${i !== deadlines.length-1 ? 'border-b border-slate-50' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-1.5"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{m.content}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{m.sender} · {m.time}</p>
                    </div>
                    <button onClick={() => onDismiss?.(m.id)}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-slate-200 hover:bg-red-50 hover:text-red-400 transition-colors"
                      title="刪除此訊息">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-6 rounded-[28px] text-white">
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-purple-200">學測倒數</p>
            <p className="text-4xl font-black mb-1">{daysLeft > 0 ? `${daysLeft} 天` : '已到來'}</p>
            <p className="text-xs text-purple-200">距離 114 學年度學科能力測驗</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
//  NavItem / StatBox
// ══════════════════════════════════════════════════
const NavItem = ({ icon, label, active, onClick, collapsed }) => (
  <div onClick={onClick}
    className={`flex items-center gap-4 px-3 md:px-6 py-4 rounded-2xl cursor-pointer transition-all duration-200
      ${active ? 'bg-[#7C3AED] text-white shadow-xl shadow-purple-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}
      ${collapsed ? 'justify-center' : ''}`}>
    <span className="shrink-0">{icon}</span>
    {!collapsed && <span className="text-sm font-bold tracking-tight whitespace-nowrap">{label}</span>}
  </div>
);

const StatBox = ({ icon, label, value, sub, onClick }) => (
  <div onClick={onClick}
    className={`bg-white p-5 md:p-7 rounded-[28px] md:rounded-[35px] shadow-sm border border-slate-50 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 group select-none
      ${onClick ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'}`}>
    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 group-hover:bg-white group-hover:shadow-md transition-all">{icon}</div>
    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
    <p className="text-xl md:text-2xl font-black text-slate-800 mb-1">{value}</p>
    <p className="text-[10px] text-slate-400 font-medium">{sub}</p>
  </div>
);

// ══════════════════════════════════════════════════
//  App
// ══════════════════════════════════════════════════
const App = () => {
  const [token,            setToken]            = useState(() => getStoredToken());
  const [activeTab,        setActiveTab]        = useState('dashboard');
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('smarthub_dismissed') || '[]')); }
    catch { return new Set(); }
  });
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery,      setSearchQuery]      = useState('');

  // 手動新增的行事曆事件（localStorage 持久化）
  const [manualEvents, setManualEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smarthub_events') || '[]'); } catch { return []; }
  });
  // 已被使用者刪除的自動解析事件 ID
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smarthub_hidden') || '[]'); } catch { return []; }
  });
  // Google Calendar 同步：SmartHub 日曆 ID
  const [gcalId, setGcalId] = useState(() => localStorage.getItem('smarthub_gcal_id') || null);
  // SmartHub 事件 ID → Google Calendar 事件 ID 的對應表
  const [gcalMap, setGcalMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smarthub_gcal_map') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('smarthub_events', JSON.stringify(manualEvents));
  }, [manualEvents]);
  useEffect(() => {
    localStorage.setItem('smarthub_hidden', JSON.stringify(hiddenIds));
  }, [hiddenIds]);
  useEffect(() => {
    localStorage.setItem('smarthub_dismissed', JSON.stringify([...dismissed]));
  }, [dismissed]);
  useEffect(() => {
    if (gcalId) localStorage.setItem('smarthub_gcal_id', gcalId);
  }, [gcalId]);
  useEffect(() => {
    localStorage.setItem('smarthub_gcal_map', JSON.stringify(gcalMap));
  }, [gcalMap]);

  // token 狀態警告：null = 正常；'refreshing' = 靜默刷新中；'failed' = 需重新登入
  const [tokenWarning, setTokenWarning] = useState(null);
  // 防止同時多次觸發靜默刷新（ref 不觸發重渲染）
  const tokenRefreshingRef = React.useRef(false);

  const handleTokenExpired = useCallback(async () => {
    if (tokenRefreshingRef.current) return; // 正在刷新中，忽略重複觸發
    tokenRefreshingRef.current = true;
    setTokenWarning('refreshing');
    try {
      // 先嘗試靜默刷新，成功就無縫更新 token，使用者完全感知不到
      const newToken = await silentRefreshToken(GOOGLE_CLIENT_ID);
      setToken(newToken);
      setTokenWarning(null);
    } catch {
      // 靜默刷新也失敗（使用者已登出 Google）→ 跳回登入畫面
      clearToken();
      setToken(null);
      setTokenWarning(null);
    } finally {
      tokenRefreshingRef.current = false;
    }
  }, []);

  // ref 版本供 GCal sync 等 callback 使用（避免 stale closure 問題）
  const handleTokenExpiredRef = React.useRef(handleTokenExpired);
  useEffect(() => { handleTokenExpiredRef.current = handleTokenExpired; }, [handleTokenExpired]);

  // ── 主動偵測 token 即將到期，提前 10 分鐘靜默刷新 ──────
  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      const expiry = getTokenExpiry();
      if (!expiry) return;
      const timeLeft = expiry - Date.now();
      // token 剩餘不足 10 分鐘 → 主動刷新，使用者完全無感
      if (timeLeft > 0 && timeLeft < 10 * 60 * 1000) {
        try {
          const newToken = await silentRefreshToken(GOOGLE_CLIENT_ID);
          setToken(newToken);
        } catch { /* 靜默失敗，等實際 API 請求失敗時再由 handleTokenExpired 處理 */ }
      }
    }, 60_000); // 每分鐘檢查一次
    return () => clearInterval(id);
  }, [token]);
  const { messages, schoolNews, loading, error, refresh } = useData(token, handleTokenExpired);

  // 登入後初始化：取得或建立 SmartHub 日曆
  useEffect(() => {
    if (!token || gcalId) return;
    getOrCreateSmartHubCalendar(token)
      .then(id => setGcalId(id))
      .catch(err => console.warn('SmartHub 日曆初始化失敗：', err.message));
  }, [token, gcalId]);

  // 自動解析行事曆事件
  const parsedEvents = useMemo(() => parseEventsFromData(messages, schoolNews), [messages, schoolNews]);
  const hiddenSet    = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const calendarEvents = useMemo(() => [
    ...manualEvents,
    ...parsedEvents.filter(e => !hiddenSet.has(e.id)),
  ], [manualEvents, parsedEvents, hiddenSet]);

  // 取得當前 gcalId（閉包中可能尚未更新，用 ref 輔助）
  const gcalIdRef = React.useRef(gcalId);
  useEffect(() => { gcalIdRef.current = gcalId; }, [gcalId]);
  const gcalMapRef = React.useRef(gcalMap);
  useEffect(() => { gcalMapRef.current = gcalMap; }, [gcalMap]);
  // 正在同步中的事件 ID 集合（防止競態條件導致重複建立）
  const syncingIdsRef = React.useRef(new Set());

  // ── Google Calendar 同步輔助 ─────────────────────────
  const syncToGCal = useCallback(async (ev) => {
    if (!token) return;
    // 校網行事曆抓取的行程不同步（避免與原本訂閱的校網 Google Calendar 重複）
    if (ev.source === 'school') return;
    // 防止同一事件被同時同步兩次（競態條件）
    if (syncingIdsRef.current.has(ev.id)) return;
    syncingIdsRef.current.add(ev.id);
    try {
      // 確保有日曆 ID
      let calId = gcalIdRef.current;
      if (!calId) {
        calId = await getOrCreateSmartHubCalendar(token);
        setGcalId(calId);
        gcalIdRef.current = calId;
      }
      const existingGcalId = gcalMapRef.current[ev.id];
      let newGcalId;
      if (existingGcalId) {
        // 已存在 → 更新
        await updateGCalEvent(token, calId, existingGcalId, ev);
        newGcalId = existingGcalId;
      } else {
        // 不存在 → 新增
        newGcalId = await createGCalEvent(token, calId, ev);
      }
      // 更新對應表（同時更新 ref，讓後續同步立即感知）
      setGcalMap(prev => {
        const next = { ...prev, [ev.id]: newGcalId };
        gcalMapRef.current = next;
        return next;
      });
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') handleTokenExpiredRef.current();
      else console.warn('Google Calendar 同步失敗：', err.message);
    } finally {
      // 無論成功或失敗，都釋放鎖
      syncingIdsRef.current.delete(ev.id);
    }
  }, [token]);

  const removeFromGCal = useCallback(async (eventId) => {
    if (!token) return;
    const gcalEventId = gcalMapRef.current[eventId];
    if (!gcalEventId) return;
    try {
      const calId = gcalIdRef.current;
      if (calId) await deleteGCalEvent(token, calId, gcalEventId);
      setGcalMap(prev => {
        const next = { ...prev };
        delete next[eventId];
        gcalMapRef.current = next;
        return next;
      });
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') handleTokenExpiredRef.current();
      else console.warn('Google Calendar 刪除失敗：', err.message);
    }
  }, [token]);

  // ── 自動解析行程同步：parsedEvents 有新行程時推送到 Google Calendar ──
  useEffect(() => {
    if (!token || !gcalId || parsedEvents.length === 0) return;
    // 只同步還沒在 gcalMap 裡、沒被隱藏、非校網來源、且目前不在同步中的行程
    const unsynced = parsedEvents.filter(
      ev => ev.source !== 'school'
         && !hiddenSet.has(ev.id)
         && !gcalMapRef.current[ev.id]
         && !syncingIdsRef.current.has(ev.id)
    );
    if (unsynced.length === 0) return;

    // 依序同步（不用 Promise.all 避免一次發太多請求）
    const syncAll = async () => {
      for (const ev of unsynced) {
        await syncToGCal(ev);
      }
    };
    syncAll().catch(err => console.warn('自動行程批次同步失敗：', err.message));
  }, [token, gcalId, parsedEvents, hiddenSet, syncToGCal]);

  const handleSaveEvent = useCallback((event) => {
    const { _hideSourceId, ...ev } = event;
    setManualEvents(prev => [...prev.filter(e => e.id !== ev.id), ev]);
    // 若是從自動解析行程編輯過來，隱藏原事件避免重複
    if (_hideSourceId) {
      setHiddenIds(prev => prev.includes(_hideSourceId) ? prev : [...prev, _hideSourceId]);
      // 同時移除原事件在 Google Calendar 的行程
      removeFromGCal(_hideSourceId);
    }
    // 同步到 Google Calendar
    syncToGCal(ev);
  }, [syncToGCal, removeFromGCal]);

  const handleDeleteEvent = useCallback((id) => {
    if (id.startsWith('manual_')) {
      setManualEvents(prev => prev.filter(e => e.id !== id));
    } else {
      setHiddenIds(prev => [...prev.filter(x => x !== id), id]);
    }
    // 同步刪除 Google Calendar 行程
    removeFromGCal(id);
  }, [removeFromGCal]);

  // ── 清空 Google Calendar 所有行程並重新同步 ──────────
  const [gcalResetting, setGcalResetting] = useState(false);
  const handleResetGCal = useCallback(async () => {
    if (!token || !gcalId || gcalResetting) return;
    setGcalResetting(true);
    try {
      // 1. 刪除 SmartHub 日曆所有行程
      await clearAllGCalEvents(token, gcalId);
      // 2. 清空本地對應表
      const emptyMap = {};
      setGcalMap(emptyMap);
      gcalMapRef.current = emptyMap;
      syncingIdsRef.current.clear();
      // 3. 重新同步：手動行程
      for (const ev of manualEvents) {
        await syncToGCal(ev);
      }
      // 4. 重新同步：自動解析行程（排除校網、排除已隱藏）
      for (const ev of parsedEvents) {
        if (ev.source === 'school') continue;
        if (hiddenSet.has(ev.id)) continue;
        await syncToGCal(ev);
      }
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') handleTokenExpiredRef.current();
      else console.warn('重置 Google Calendar 失敗：', err.message);
    } finally {
      setGcalResetting(false);
    }
  }, [token, gcalId, gcalResetting, manualEvents, parsedEvents, hiddenSet, syncToGCal]);

  useEffect(() => {
    if ('Notification' in window) Notification.requestPermission();
  }, []);

  const handleLogin  = async () => { const t = await requestAccessToken(GOOGLE_CLIENT_ID); setToken(t); };
  const handleLogout = () => { clearToken(); setToken(null); };
  const handleTabChange = (tab) => { setActiveTab(tab); setSidebarOpen(false); };
  // 供 InboxView 懶載入 Gmail 完整內文用
  const handleFetchGmailBody = useCallback((gmailId) => fetchGmailBody(token, gmailId), [token]);
  const dismiss      = (id) => setDismissed(prev => new Set([...prev, id]));
  const pendingCount = messages.filter(m => m.status === 'pending' && !dismissed.has(m.id)).length;

  if (!token) return <LoginScreen onLogin={handleLogin}/>;

  return (
    <div className="flex h-screen bg-[#F4F7FE] text-slate-800 antialiased overflow-hidden">

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-purple-500"/>
            <p className="text-sm font-bold text-slate-500">載入資料中…</p>
          </div>
        </div>
      )}

      {/* Token 靜默刷新中提示：資料保持顯示，僅在頂部顯示小提示條 */}
      {tokenWarning === 'refreshing' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-500 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          <Loader2 size={13} className="animate-spin"/>
          正在更新登入狀態，請稍候…
        </div>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)}/>
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed md:relative z-30 h-full bg-white border-r border-slate-200 flex flex-col p-6 md:p-8
        transition-all duration-300 ease-in-out shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${sidebarCollapsed ? 'md:w-20' : 'w-72'}
      `}>
        <div className={`flex items-center mb-10 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#7C3AED] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-200 font-black text-xl shrink-0">S</div>
              <h1 className="font-extrabold text-2xl tracking-tight text-slate-800">SmartHub</h1>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-11 h-11 bg-[#7C3AED] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-200 font-black text-xl">S</div>
          )}
          <button onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 shrink-0">
            <Menu size={18}/>
          </button>
          <button onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 shrink-0">
            <Close size={18}/>
          </button>
        </div>

        <nav className="space-y-2 flex-1">
          <NavItem icon={<Calendar size={22}/>} label="總覽儀表板"    active={activeTab==='dashboard'} onClick={() => handleTabChange('dashboard')} collapsed={sidebarCollapsed}/>
          <NavItem icon={<Inbox size={22}/>}    label="訊息收件匣"    active={activeTab==='inbox'}     onClick={() => handleTabChange('inbox')}     collapsed={sidebarCollapsed}/>
          <NavItem icon={<School size={22}/>}   label="校園/升學資訊" active={activeTab==='school'}    onClick={() => handleTabChange('school')}    collapsed={sidebarCollapsed}/>
        </nav>

        {!sidebarCollapsed ? (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-5 rounded-[24px] border border-purple-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Pending</span>
                {pendingCount > 0 && <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>}
              </div>
              <p className="text-2xl font-black text-slate-800 mb-1">{pendingCount}</p>
              <p className="text-xs text-slate-500 font-medium">待確認的行程擬稿</p>
            </div>
            <div className="flex gap-2">
              <button onClick={refresh} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold hover:bg-slate-100 transition-colors">
                <RefreshCw size={13}/> 重新整理
              </button>
              <button onClick={handleLogout} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold hover:bg-red-50 hover:text-red-500 transition-colors">
                <LogOut size={13}/> 登出
              </button>
            </div>
            {gcalId && (
              <button onClick={handleResetGCal} disabled={gcalResetting}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-400 text-xs font-bold hover:bg-purple-50 hover:text-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {gcalResetting
                  ? <><Loader2 size={13} className="animate-spin"/> 同步中…</>
                  : <><RefreshCw size={13}/> 重置 Google 日曆同步</>}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative">
              <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                <Bell size={18} className="text-purple-500"/>
              </div>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
              )}
            </div>
            <button onClick={handleLogout} className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-400 transition-colors">
              <LogOut size={16}/>
            </button>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 px-4 md:px-10 flex items-center justify-between shrink-0 gap-4">
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-600 shrink-0">
            <Menu size={20}/>
          </button>

          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md px-4 md:px-6 py-3 rounded-2xl flex-1 max-w-[450px] shadow-sm border border-white">
            <Search size={18} className="text-slate-400 shrink-0"/>
            <input
              type="text"
              placeholder="搜尋訊息、發送者、來源 App…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (activeTab === 'dashboard') setActiveTab('inbox'); }}
              className="bg-transparent border-none focus:outline-none text-sm w-full font-medium min-w-0"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-300 hover:text-slate-500 shrink-0">
                <X size={14}/>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            {error && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-500 font-bold bg-amber-50 px-3 py-1.5 rounded-xl">
                <AlertCircle size={13}/> {error}
              </div>
            )}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-700">高三專注模式</span>
              <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                {SHEET_ID ? 'Google Sheet 已對接' : '尚未設定 Sheet'}
              </span>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#A855F7] p-0.5 shadow-lg shadow-purple-100 shrink-0">
              <div className="w-full h-full rounded-[12px] md:rounded-[14px] bg-white flex items-center justify-center font-bold text-purple-600 text-xs">User</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-10 pb-10">
          {activeTab === 'dashboard' && (
            <DashboardView
              messages={messages} schoolNews={schoolNews}
              dismissed={dismissed} onDismiss={dismiss}
              calendarEvents={calendarEvents}
              onSaveEvent={handleSaveEvent} onDeleteEvent={handleDeleteEvent}
            />
          )}
          {activeTab === 'inbox' && <InboxView messages={messages} searchQuery={searchQuery} onFetchBody={handleFetchGmailBody}/>}
          {activeTab === 'school' && (
            <SchoolView
              schoolNews={schoolNews} messages={messages}
              calendarEvents={calendarEvents}
              onSaveEvent={handleSaveEvent} onDeleteEvent={handleDeleteEvent}
              searchQuery={searchQuery}
              dismissed={dismissed} onDismiss={dismiss}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
