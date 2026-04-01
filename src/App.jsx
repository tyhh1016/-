import React, { useState, useEffect } from 'react';
import { Calendar, Inbox, Bell, Check, X, MessageSquare, Clock, School, Search, Hash, MoreHorizontal } from 'lucide-react';

/**
 * SmartPlannerHub - 整合版
 * 包含：H-care UI, Google Sheets 接口預留, 手機 Web Push 邏輯
 */

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [messages, setMessages] = useState([]);
  const [isNotifyReady, setIsNotifyReady] = useState(false);

  // 模擬資料：符合 A:時間, B:App, C:發送者, D:內容 的結構
  useEffect(() => {
    // 1. 請求手機通知權限
    if ("Notification" in window) {
      Notification.requestPermission().then(p => setIsNotifyReady(p === "granted"));
    }

    // 2. 模擬數據加載
    setMessages([
      { id: 1, app: 'Gmail', sender: 'Google Classroom', content: '數學老師發布作業：微積分 P.20，截止：週五 23:59', time: '23:04', status: 'pending' },
      { id: 2, app: 'Line', sender: '導師', content: '明天早自習要進行升學講座，請大家準時。', time: '22:15', status: 'pending' },
      { id: 3, app: 'Instagram', sender: '學長', content: '那本參考書還要用嗎？', time: '21:30', status: 'read' },
      { id: 4, app: 'X', sender: '教育廣播', content: '今日高三學科能力測驗重點整理...', time: '19:00', status: 'new' }
    ]);
  }, []);

  // 觸發手機下滑訊息列通知
  const sendPush = (title, body) => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "https://cdn-icons-png.flaticon.com/512/3652/3652191.png" });
    } else {
      alert("請開啟瀏覽器通知權限以模擬手機訊息列效果");
    }
  };

  return (
    <div className="flex h-screen bg-[#F4F7FE] text-slate-800 antialiased overflow-hidden">
      {/* --- 左側側邊欄 --- */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col p-8">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-11 h-11 bg-[#7C3AED] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-200 font-black text-xl">S</div>
          <h1 className="font-extrabold text-2xl tracking-tight text-slate-800">SmartHub</h1>
        </div>

        <nav className="space-y-2 flex-1">
          <NavItem icon={<Calendar size={22}/>} label="總覽儀表板" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Inbox size={22}/>} label="訊息收件匣" active={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} />
          <NavItem icon={<School size={22}/>} label="校園/升學資訊" active={activeTab === 'school'} onClick={() => setActiveTab('school')} />
        </nav>

        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-6 rounded-[24px] border border-purple-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Pending</span>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
          </div>
          <p className="text-2xl font-black text-slate-800 mb-1">{messages.filter(m => m.status === 'pending').length}</p>
          <p className="text-xs text-slate-500 font-medium mb-4">待確認的行程擬稿</p>
          <button
            onClick={() => sendPush("新行程擬稿確認", "偵測到來自 Google Classroom 的截止日期，已為您擬好行程。")}
            className="w-full bg-white text-purple-600 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            測試手機通知
          </button>
        </div>
      </aside>

      {/* --- 右側主內容區 --- */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 頂部控制列 */}
        <header className="h-24 px-10 flex items-center justify-between">
          <div className="flex items-center gap-4 bg-white/60 backdrop-blur-md px-6 py-3 rounded-2xl w-[450px] shadow-sm border border-white">
            <Search size={18} className="text-slate-400" />
            <input type="text" placeholder="搜尋訊息、課程或升學資訊..." className="bg-transparent border-none focus:outline-none text-sm w-full font-medium" />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-700">高三專注模式</span>
              <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Google Sheet 已對接
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#A855F7] p-0.5 shadow-lg shadow-purple-100">
              <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center font-bold text-purple-600">User</div>
            </div>
          </div>
        </header>

        {/* 內容區塊 */}
        <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-8">
          {/* 數據統計欄 */}
          <div className="grid grid-cols-4 gap-6">
            <StatBox icon={<Clock className="text-blue-500"/>} label="今日課表" value="6 堂" sub="下一堂：物理 (14:00)" />
            <StatBox icon={<MessageSquare className="text-purple-500"/>} label="社交訊息" value="12 則" sub="3 則來自 Line 重要聯繫" />
            <StatBox icon={<Calendar className="text-orange-500"/>} label="待辦作業" value="2 件" sub="微積分習題即將截止" />
            <StatBox icon={<School className="text-emerald-500"/>} label="升學資訊" value="1 則" sub="校網升學公告更新" />
          </div>

          <div className="grid grid-cols-12 gap-8">
            {/* 行事曆主區 (8欄) */}
            <div className="col-span-8 bg-white rounded-[40px] p-10 shadow-sm border border-slate-100/50">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">智慧行事曆</h2>
                <div className="flex gap-2">
                  <button className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">週檢視</button>
                  <button className="px-5 py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold">月檢視</button>
                </div>
              </div>

              {/* 類 Google Calendar 佈局 */}
              <div className="grid grid-cols-7 gap-4 border-t border-slate-50 pt-8">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                  <div key={day} className="space-y-4">
                    <p className={`text-center text-[11px] font-black tracking-tighter uppercase ${i === 2 ? 'text-purple-600' : 'text-slate-300'}`}>{day}</p>
                    <div className={`h-64 rounded-3xl border-2 ${i === 2 ? 'bg-purple-50/30 border-purple-100' : 'bg-slate-50/50 border-transparent'} transition-all relative p-2`}>
                      {i === 2 && (
                        <div className="bg-white p-3 rounded-2xl shadow-sm border-l-4 border-purple-500 text-[10px] font-bold text-slate-700">
                          討論升學專題
                          <p className="text-[9px] text-slate-400 font-normal mt-1">14:00 - 圖書館</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 確認擬稿區 (4欄) */}
            <div className="col-span-4 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-800">待審核擬稿</h2>
                <MoreHorizontal className="text-slate-300" />
              </div>

              {messages.filter(m => m.status === 'pending').map(msg => (
                <div key={msg.id} className="group bg-white p-6 rounded-[32px] shadow-xl shadow-slate-200/40 border border-white hover:border-purple-100 transition-all">
                  <div className="flex justify-between mb-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${msg.app === 'Gmail' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                      {msg.app} 偵測
                    </span>
                    <span className="text-[10px] font-bold text-slate-300">{msg.time}</span>
                  </div>

                  <div className="mb-4">
                    <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">{msg.sender}</p>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed italic">「{msg.content}」</p>
                  </div>

                  <div className="flex gap-3">
                    <button className="flex-1 bg-emerald-500 text-white py-3.5 rounded-2xl flex items-center justify-center hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all active:scale-95">
                      <Check size={22} strokeWidth={3} />
                    </button>
                    <button className="flex-1 bg-slate-50 text-slate-400 py-3.5 rounded-2xl flex items-center justify-center hover:bg-slate-100 transition-all active:scale-95">
                      <X size={22} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}

              {/* 快速收件匣摘要 */}
              <div className="mt-10 p-2">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-6">今日訊息流</h3>
                <div className="space-y-5">
                  {messages.slice(2, 4).map(m => (
                    <div key={m.id} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center shadow-sm font-bold text-xs">{m.app[0]}</div>
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
      </main>
    </div>
  );
};

// --- 精簡組件 ---
const NavItem = ({ icon, label, active, onClick }) => (
  <div onClick={onClick} className={`flex items-center gap-4 px-6 py-4 rounded-2xl cursor-pointer transition-all duration-300 ${active ? 'bg-[#7C3AED] text-white shadow-xl shadow-purple-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
    {icon}
    <span className="text-sm font-bold tracking-tight">{label}</span>
  </div>
);

const StatBox = ({ icon, label, value, sub }) => (
  <div className="bg-white p-7 rounded-[35px] shadow-sm border border-slate-50 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 cursor-default group">
    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-white group-hover:shadow-md transition-all">{icon}</div>
    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
    <p className="text-2xl font-black text-slate-800 mb-1">{value}</p>
    <p className="text-[10px] text-slate-400 font-medium">{sub}</p>
  </div>
);

export default App;
