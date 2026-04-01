import React, { useState, useEffect } from 'react';
import { Calendar, Inbox, Check, X, MessageSquare, Clock, School, Search, MoreHorizontal, Bell, BookOpen, Trophy, ChevronRight, Menu, X as Close } from 'lucide-react';

const MESSAGES = [
  { id: 1, app: 'Gmail', sender: 'Google Classroom', content: '數學老師發布作業：微積分 P.20，截止：週五 23:59', time: '23:04', status: 'pending' },
  { id: 2, app: 'Line',  sender: '導師',             content: '明天早自習要進行升學講座，請大家準時。',           time: '22:15', status: 'pending' },
  { id: 3, app: 'Instagram', sender: '學長',         content: '那本參考書還要用嗎？',                           time: '21:30', status: 'read'    },
  { id: 4, app: 'X',    sender: '教育廣播',          content: '今日高三學科能力測驗重點整理...',                 time: '19:00', status: 'new'     },
];

/* ── 總覽儀表板 ── */
const DashboardView = ({ messages, dismissed, onDismiss }) => {
  const visiblePending = messages.filter(m => m.status === 'pending' && !dismissed.has(m.id));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatBox icon={<Clock className="text-blue-500"/>}           label="今日課表" value="6 堂"  sub="下一堂：物理 (14:00)" />
        <StatBox icon={<MessageSquare className="text-purple-500"/>} label="社交訊息" value="12 則" sub="3 則來自 Line 重要聯繫" />
        <StatBox icon={<Calendar className="text-orange-500"/>}      label="待辦作業" value="2 件"  sub="微積分習題即將截止" />
        <StatBox icon={<School className="text-emerald-500"/>}       label="升學資訊" value="1 則"  sub="校網升學公告更新" />
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
              {messages.slice(2, 4).map(m => (
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
const SchoolView = () => {
  const news = [
    { icon: <Trophy size={20} className="text-yellow-500"/>, tag: '升學公告', title: '113 學年度學科能力測驗報名開始', date: '04/01', desc: '報名截止日為 4 月 30 日，請同學盡早完成線上報名。', color: 'bg-yellow-50 border-yellow-100' },
    { icon: <BookOpen size={20} className="text-blue-500"/>, tag: '課業資源', title: '數學輔導課表 — 第二學期更新',     date: '03/28', desc: '每週二、四 16:00–18:00，於 302 教室，歡迎自由參加。',  color: 'bg-blue-50 border-blue-100' },
    { icon: <Bell size={20} className="text-purple-500"/>,   tag: '校內公告', title: '升學博覽會：4/15 於體育館',       date: '03/25', desc: '全台 50 所大學設攤，提供系所介紹與備審資料諮詢。',    color: 'bg-purple-50 border-purple-100' },
    { icon: <School size={20} className="text-emerald-500"/>,tag: '志願填寫', title: '繁星推薦志願填寫說明會',           date: '03/20', desc: '時間：4/5 上午 10 點，地點：演講廳，出席請簽到。',    color: 'bg-emerald-50 border-emerald-100' },
  ];
  const deadlines = [
    { label: '微積分作業',   due: '週五 23:59', urgent: true  },
    { label: '學測報名截止', due: '04/30',       urgent: false },
    { label: '繁星推薦截止', due: '05/10',       urgent: false },
    { label: '指考報名截止', due: '06/01',       urgent: false },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <h2 className="text-2xl font-black text-slate-800">校園公告 &amp; 升學資訊</h2>
          {news.map((n, i) => (
            <div key={i} className={`bg-white p-6 md:p-7 rounded-[28px] border ${n.color} hover:shadow-lg transition-all cursor-pointer group`}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm shrink-0">{n.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{n.tag}</span>
                    <span className="text-[10px] font-bold text-slate-300">{n.date}</span>
                  </div>
                  <p className="text-base font-black text-slate-800 mb-1 group-hover:text-purple-700 transition-colors">{n.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{n.desc}</p>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-purple-400 transition-colors shrink-0 mt-1" />
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <h2 className="text-xl font-black text-slate-800">重要截止日期</h2>
          <div className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100/50 space-y-4">
            {deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.urgent ? 'bg-red-400' : 'bg-slate-200'}`}></div>
                  <p className="text-sm font-bold text-slate-700">{d.label}</p>
                </div>
                <span className={`text-xs font-black px-3 py-1 rounded-full ${d.urgent ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>{d.due}</span>
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-6 rounded-[28px] text-white">
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-purple-200">學測倒數</p>
            <p className="text-4xl font-black mb-1">87 天</p>
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
  const [activeTab, setActiveTab]   = useState('dashboard');
  const [dismissed, setDismissed]   = useState(new Set());
  const [sidebarOpen, setSidebarOpen]     = useState(false);   // mobile overlay
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop collapse

  useEffect(() => {
    if ("Notification" in window) Notification.requestPermission();
  }, []);

  // Close mobile sidebar when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const sendPush = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png' });
    } else {
      alert('請開啟瀏覽器通知權限以模擬手機訊息列效果');
    }
  };

  const dismiss = (id) => setDismissed(prev => new Set([...prev, id]));
  const pendingCount = MESSAGES.filter(m => m.status === 'pending' && !dismissed.has(m.id)).length;

  return (
    <div className="flex h-screen bg-[#F4F7FE] text-slate-800 antialiased overflow-hidden">

      {/* ── Mobile backdrop ── */}
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
        {/* Logo + desktop collapse toggle */}
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
          {/* Desktop collapse button */}
          <button onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 shrink-0">
            <Menu size={18} />
          </button>
          {/* Mobile close button */}
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

        {!sidebarCollapsed && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-5 rounded-[24px] border border-purple-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Pending</span>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
            </div>
            <p className="text-2xl font-black text-slate-800 mb-1">{pendingCount}</p>
            <p className="text-xs text-slate-500 font-medium mb-4">待確認的行程擬稿</p>
            <button onClick={() => sendPush('新行程擬稿確認', '偵測到來自 Google Classroom 的截止日期，已為您擬好行程。')}
              className="w-full bg-white text-purple-600 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-95">
              測試手機通知
            </button>
          </div>
        )}

        {sidebarCollapsed && (
          <div className="flex justify-center pb-2">
            <div className="relative">
              <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                <Bell size={18} className="text-purple-500" />
              </div>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 px-4 md:px-10 flex items-center justify-between shrink-0 gap-4">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-600 shrink-0">
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md px-4 md:px-6 py-3 rounded-2xl flex-1 max-w-[450px] shadow-sm border border-white">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input type="text" placeholder="搜尋訊息、課程或升學資訊..." className="bg-transparent border-none focus:outline-none text-sm w-full font-medium min-w-0" />
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-700">高三專注模式</span>
              <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Google Sheet 已對接
              </span>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#A855F7] p-0.5 shadow-lg shadow-purple-100 shrink-0">
              <div className="w-full h-full rounded-[12px] md:rounded-[14px] bg-white flex items-center justify-center font-bold text-purple-600 text-xs">User</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-10 pb-10">
          {activeTab === 'dashboard' && <DashboardView messages={MESSAGES} dismissed={dismissed} onDismiss={dismiss} />}
          {activeTab === 'inbox'     && <InboxView messages={MESSAGES} />}
          {activeTab === 'school'    && <SchoolView />}
        </div>
      </main>
    </div>
  );
};

export default App;
