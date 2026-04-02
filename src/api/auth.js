/**
 * Google Identity Services (GIS) OAuth 2.0 — Token Model
 * 不需後端，直接在瀏覽器取得 access token
 */

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const TOKEN_KEY   = 'smarthub_token';
const EXPIRY_KEY  = 'smarthub_token_expiry';

// ── 儲存 / 讀取 / 清除 token ──────────────────────────────
export const getStoredToken = () => {
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
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + Number(expiresIn) * 1000 - 60000));
};

export const clearToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
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

// ── 請求 access token（會跳出 Google 授權視窗）──────────
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
