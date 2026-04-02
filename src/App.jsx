import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Inbox, Check, X, MessageSquare, Clock, School, Search, MoreHorizontal, Bell, BookOpen, Trophy, ChevronRight, Menu, X as Close, LogOut, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { GOOGLE_CLIENT_ID, SHEET_ID, SCHOOL_URL } from './config';
import { getStoredToken, requestAccessToken, clearToken } from './api/auth';
import { fetchSheetMessages } from './api/sheets';
import { fetchGmailMessages } from './api/gmail';
import { fetchSchoolNews } from './api/school';

/* ── 資料抓取 hook ── */
const useData = (token, onTokenExpired) => {
  const [messages,   setMessages]   = useState([]);
  const [schoolNews, setSchoolNews] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [sheetRes, gmailRes, schoolRes] = await Promise.allSettled([
        SHEET_ID ? fetchSheetMessages(token, SHEET_ID) : Promise.resolve([]),
        fetchGmailMessages(token),
        fetchSchoolNews(SCHOOL_URL),
      ]);

      if (sheetRes.reason?.message === 'TOKEN_EXPIRED' || gmailRes.reason?.message === 'TOKEN_EXPIRED') {
        onTokenExpired(); return;
      }

      const msgs = [
        ...(sheetRes.status  === 'fulfilled' ? sheetRes.value  : []),
        ...(gmailRes.status  === 'fulfilled' ? gmailRes.value  : []),
      ];
      setMessages(msgs);
      setSchoolNews(schoolRes.status === 'fulfilled' ? schoolRes.value : []);

      const errs = [sheetRes, gmailRes, schoolRes]
        .filter(r => r.status === 'rejected')
        .map(r => r.reason?.message);
      if (errs.length) setError(`部分資料載入失敗：${errs.join('、')}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, onTokenExpired]);

  useEffect(() => { load(); }, [load]);
  return { messages, schoolNews, loading, error, refresh: load };
};

/* ── 登入畫面 ── */
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
        {err && (
          <div className="flex items-center gap-2 bg-red-50 text-red-500 rounded-2xl px-4 py-3 text-xs font-bold mb-6">
            <AlertCircle size={14} /> {err}
          </div>
        )}
        <button onClick={handleLogin} disabled={busy}
          className="w-full bg-[#7C3AED] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-purple-700 active:scale-95 transition-all shadow-lg shadow-purple-200 disabled:opacity-60">
          {busy ? <Loader2 size={18} className="animate-spin" /> : (
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

/* ── 總覽儀表板 ── */
const DashboardView = ({ messages, schoolNews, dismissed, onDismiss }) => {
  const visiblePending = messages.filter(m => m.status === 'pending' && !dismissed.has(m.id));
  const deadlineKw = /作業|截止|繳交|deadline/i;
  const deadlineCount = messages.filter(m => deadlineKw.test(m.content)).length;
  const recentNonPending = messages.filter(m => m.status !== 'pending').slice(0, 2);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatBox icon={<MessageSquare className="text-purple-500"/>} label="社交訊息"
          value={`${messages.length} 則`}
          sub={messages.length ? `最新：${messages[0]?.sender}` : '尚無訊息'} />
        <StatBox icon={<Bell className="text-blue-500"/>} label="待確認擬稿"
          value={`${visiblePending.length} 件`}
          sub={visiblePending.length ? `來自 ${visiblePending[0]?.app}` : '全部已確認'} />
        <StatBox icon={<Calendar className="text-orange-500"/>} label="截止相關"
          value={`${deadlineCount} 件`}
          sub={deadlineCount ? '含作業/截止關鍵字' : '目前無截止通知'} />
        <StatBox icon={<School className="text-emerald-500"/>} label="校網公告"
          value={`${schoolNews.length} 則`}
          sub={schoolNews.length ? schoolNews[0]?.title?.slice(0, 12) + '…' : '尚無公告'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 行事曆 */}
        <div className="lg:col-span-8 bg-white rounded-[40px] p-6 md:p-10 shadow-sm border border-slate-100/50">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">智慧行事曆</h2>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">週檢視</button>
              <button className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors">月檢視</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 md:gap-4 border-t border-slate-50 pt-6">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
              <div key={day} className="space-y-2 md:space-y-4">
                <p className={`text-center text-[10px] font-black tracking-tighter uppercase ${i===2 ? 'text-purple-600' : 'text-slate-300'}`}>{day}</p>
                <div className={`h-40 md:h-64 rounded-2xl md:rounded-3xl border-2 ${i===2 ? 'bg-purple-50/30 border-purple-100' : 'bg-slate-50/50 border-transparent'} relative p-1.5 md:p-2`}>
                  {i===2 && (
                    <div className="bg-white p-2 rounded-xl shadow-sm border-l-4 border-purple-500 text-[9px] md:text-[10px] font-bold text-slate-700">
                      討論升學專題
                      <p className="text-[8px] md:text-[9px] text-slate-400 font-normal mt-1 hidden md:block">14:00 - 圖書館</p>
                    </div>
                  )}
                  {i===4 && (
                    <div className="bg-white p-2 rounded-xl shadow-sm border-l-4 border-orange-400 text-[9px] md:text-[10px] font-bold text-slate-700">
                      微積分截止
                      <p className="text-[8px] md:text-[9px] text-slate-400 font-normal mt-1 hidden md:block">23:59 - 線上繳交</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 待審核擬稿 */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800">待審核擬稿</h2>
            <MoreHorizontal size={20} className="text-slate-300" />
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
                  <Check size={22} strokeWidth={3} />
                </button>
                <button onClick={() => onDismiss(msg.id)} className="flex-1 bg-slate-50 text-slate-400 py-3.5 rounded-2xl flex items-center justify-center hover:bg-slate-100 transition-all active:scale-95">
                  <X size={22} strokeWidth={3} />
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

/* ── 訊息收件匣 ── */
const InboxView = ({ messages }) => {
  const [filter, setFilter] = useState('all');
  const appColors = { Gmail: 'bg-red-50 text-red-500', Line: 'bg-green-50 text-green-600', Instagram: 'bg-pink-50 text-pink-500', X: 'bg-slate-100 text-slate-600' };
  const filtered = filter === 'all' ? messages : messages.filter(m => m.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-800">訊息收件匣</h2>
        <div className="flex gap-2 flex-wrap">
          {[['all','全部'], ['pending','待確認'], ['new','最新'], ['read','已讀']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter===val ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100/50">
        {filtered.map((msg, i) => (
          <div key={msg.id} className={`flex items-start gap-5 px-6 md:px-8 py-6 hover:bg-slate-50 transition-colors cursor-pointer ${i !== filtered.length-1 ? 'border-b border-slate-50' : ''}`}>
            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-500 shrink-0">{msg.app[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-slate-800">{msg.sender}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${appColors[msg.app] ?? 'bg-slate-100 text-slate-500'}`}>{msg.app}</span>
                </div>
                <span className="text-[10px] text-slate-300 font-bold shrink-0 ml-2">{msg.time}</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{msg.content}</p>
            </div>
            <div className="shrink-0 flex items-center">
              {msg.status === 'pending' && <span className="w-2.5 h-2.5 bg-purple-500 rounded-full"></span>}
              {msg.status === 'new'     && <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm font-bold">此分類沒有訊息</div>
        )}
      </div>
    </div>
  );
};

/* ── 校園/升學資訊 ── */
const CARD_COLORS = [
  'bg-yellow-50 border-yellow-100',
  'bg-blue-50 border-blue-100',
  'bg-purple-50 border-purple-100',
  'bg-emerald-50 border-emerald-100',
  'bg-orange-50 border-orange-100',
  'bg-pink-50 border-pink-100',
];
const CARD_ICONS = [
  <Trophy size={20} className="text-yellow-500"/>,
  <BookOpen size={20} className="text-blue-500"/>,
  <Bell size={20} className="text-purple-500"/>,
  <School size={20} className="text-emerald-500"/>,
  <Calendar size={20} className="text-orange-500"/>,
  <Trophy size={20} className="text-pink-500"/>,
];

const SchoolView = ({ schoolNews, messages }) => {
  const deadlineKw = /作業|截止|繳交|deadline/i;
  const deadlines = messages.filter(m => deadlineKw.test(m.content)).slice(0, 6);

  // 計算學測倒數（假設 114 學年度學測為 2026/01/17）
  const examDate = new Date('2026-01-17');
  const daysLeft = Math.max(0, Math.ceil((examDate - Date.now()) / 86_400_000));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-800">校園公告 &amp; 升學資訊</h2>
            <span className="text-xs text-slate-400 font-medium">來源：鳳新高中校網</span>
          </div>
          {schoolNews.length === 0 && (
            <div className="bg-white rounded-[28px] p-10 text-center border border-slate-100">
              <p className="text-3xl mb-3">🏫</p>
              <p className="text-sm font-bold text-slate-400">尚無校網公告資料</p>
              <p className="text-xs text-slate-300 mt-1">可能是網路問題或 CORS 限制，請稍後再試</p>
            </div>
          )}
          {schoolNews.map((n, i) => (
            <a key={n.id} href={n.url} target="_blank" rel="noreferrer"
              className={`block bg-white p-6 md:p-7 rounded-[28px] border ${CARD_COLORS[i % CARD_COLORS.length]} hover:shadow-lg transition-all group`}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm shrink-0">
                  {CARD_ICONS[i % CARD_ICONS.length]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{n.tag}</span>
                    {n.date && <span className="text-[10px] font-bold text-slate-300">{n.date}</span>}
                  </div>
                  <p className="text-base font-black text-slate-800 mb-1 group-hover:text-purple-700 transition-colors">{n.title}</p>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-purple-400 transition-colors shrink-0 mt-1" />
              </div>
            </a>
          ))}
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

/* ── NavItem ── */
const NavItem = ({ icon, label, active, onClick, collapsed }) => (
  <div onClick={onClick}
    className={`flex items-center gap-4 px-3 md:px-6 py-4 rounded-2xl cursor-pointer transition-all duration-200 ${active ? 'bg-[#7C3AED] text-white shadow-xl shadow-purple-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'} ${collapsed ? 'justify-center' : ''}`}>
    <span className="shrink-0">{icon}</span>
    {!collapsed && <span className="text-sm font-bold tracking-tight whitespace-nowrap">{label}</span>}
  </div>
);

/* ── StatBox ── */
const StatBox = ({ icon, label, value, sub }) => (
  <div className="bg-white p-5 md:p-7 rounded-[28px] md:rounded-[35px] shadow-sm border border-slate-50 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 cursor-default group">
    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 group-hover:bg-white group-hover:shadow-md transition-all">{icon}</div>
    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
    <p className="text-xl md:text-2xl font-black text-slate-800 mb-1">{value}</p>
    <p className="text-[10px] text-slate-400 font-medium">{sub}</p>
  </div>
);

/* ── App ── */
const App = () => {
  const [token,            setToken]            = useState(() => getStoredToken());
  const [activeTab,        setActiveTab]        = useState('dashboard');
  const [dismissed,        setDismissed]        = useState(new Set());
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleTokenExpired = useCallback(() => { clearToken(); setToken(null); }, []);
  const { messages, schoolNews, loading, error, refresh } = useData(token, handleTokenExpired);

  useEffect(() => {
    if ('Notification' in window) Notification.requestPermission();
  }, []);

  const handleLogin = async () => {
    const t = await requestAccessToken(GOOGLE_CLIENT_ID);
    setToken(t);
  };

  const handleLogout = () => { clearToken(); setToken(null); };
  const handleTabChange = (tab) => { setActiveTab(tab); setSidebarOpen(false); };
  const dismiss = (id) => setDismissed(prev => new Set([...prev, id]));
  const pendingCount = messages.filter(m => m.status === 'pending' && !dismissed.has(m.id)).length;

  if (!token) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-[#F4F7FE] text-slate-800 antialiased overflow-hidden">

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-purple-500" />
            <p className="text-sm font-bold text-slate-500">載入資料中…</p>
          </div>
        </div>
      )}

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
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
            <Menu size={18} />
          </button>
          <button onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 shrink-0">
            <Close size={18} />
          </button>
        </div>

        <nav className="space-y-2 flex-1">
          <NavItem icon={<Calendar size={22}/>} label="總覽儀表板"    active={activeTab==='dashboard'} onClick={() => handleTabChange('dashboard')} collapsed={sidebarCollapsed} />
          <NavItem icon={<Inbox size={22}/>}    label="訊息收件匣"    active={activeTab==='inbox'}     onClick={() => handleTabChange('inbox')}     collapsed={sidebarCollapsed} />
          <NavItem icon={<School size={22}/>}   label="校園/升學資訊" active={activeTab==='school'}    onClick={() => handleTabChange('school')}    collapsed={sidebarCollapsed} />
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
                <RefreshCw size={13} /> 重新整理
              </button>
              <button onClick={handleLogout} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold hover:bg-red-50 hover:text-red-500 transition-colors">
                <LogOut size={13} /> 登出
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative">
              <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                <Bell size={18} className="text-purple-500" />
              </div>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
              )}
            </div>
            <button onClick={handleLogout} className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 px-4 md:px-10 flex items-center justify-between shrink-0 gap-4">
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-600 shrink-0">
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md px-4 md:px-6 py-3 rounded-2xl flex-1 max-w-[450px] shadow-sm border border-white">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input type="text" placeholder="搜尋訊息、課程或升學資訊..." className="bg-transparent border-none focus:outline-none text-sm w-full font-medium min-w-0" />
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            {error && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-500 font-bold bg-amber-50 px-3 py-1.5 rounded-xl">
                <AlertCircle size={13} /> {error}
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
          {activeTab === 'dashboard' && <DashboardView messages={messages} schoolNews={schoolNews} dismissed={dismissed} onDismiss={dismiss} />}
          {activeTab === 'inbox'     && <InboxView messages={messages} />}
          {activeTab === 'school'    && <SchoolView schoolNews={schoolNews} messages={messages} />}
        </div>
      </main>
    </div>
  );
};

export default App;
