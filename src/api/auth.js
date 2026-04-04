/**
 * Google Identity Services (GIS) OAuth 2.0 — Token Model
 * 不需後端，直接在瀏覽器取得 access token
 */

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

const TOKEN_KEY     = 'smarthub_token';
const EXPIRY_KEY    = 'smarthub_token_expiry';
const SCOPE_VER     = 'v3_stableid';
const SCOPE_VER_KEY = 'smarthub_scope_ver';

// ── 儲存 / 讀取 / 清除 token ──────────────────────────────
export const getStoredToken = () => {
  if (localStorage.getItem(SCOPE_VER_KEY) !== SCOPE_VER) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem('smarthub_gcal_id');
    localStorage.removeItem('smarthub_gcal_map');
    return null;
  }
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!expiry || Date.now() > Number(expiry)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
};

const storeToken = (token, expiresIn) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + Number(expiresIn) * 1000 - 60_000));
  localStorage.setItem(SCOPE_VER_KEY, SCOPE_VER);
};

export const clearToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
};

// ── 取得 token 到期時間（ms timestamp），null 代表未登入 ──
export const getTokenExpiry = () => {
  const expiry = localStorage.getItem(EXPIRY_KEY);
  return expiry ? Number(expiry) : null;
};

// ── 載入 GIS script ───────────────────────────────────────
export const loadGIS = () =>
  new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    document.head.appendChild(s);
  });

// ── 靜默刷新 token（不彈出視窗，使用者已授權過才有效）──────
// Google GIS token model 中，不帶 prompt 參數時，
// 若使用者在同一瀏覽器 session 仍保持 Google 登入狀態，
// 可自動取得新 token 而不打擾使用者。
export const silentRefreshToken = (clientId) =>
  new Promise((resolve, reject) => {
    loadGIS().then(() => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (res) => {
          if (res.error) return reject(new Error(res.error_description || res.error));
          storeToken(res.access_token, res.expires_in);
          resolve(res.access_token);
        },
        error_callback: (err) => reject(new Error(err.message || 'Silent refresh failed')),
      });
      // 不傳 prompt → GIS 自動嘗試靜默取得，失敗才走 error_callback
      client.requestAccessToken({ prompt: '' });
    });
  });

// ── 手動登入（會跳出 Google 授權視窗）──────────────────────
export const requestAccessToken = (clientId) =>
  new Promise((resolve, reject) => {
    loadGIS().then(() => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (res) => {
          if (res.error) return reject(new Error(res.error_description || res.error));
          storeToken(res.access_token, res.expires_in);
          resolve(res.access_token);
        },
        error_callback: (err) => reject(new Error(err.message || 'Auth failed')),
      });
      client.requestAccessToken({ prompt: 'consent' });
    });
  });
