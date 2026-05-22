'use strict';

// 動態回傳 Supabase 連線資訊 — 從 Vercel 環境變數讀取
// 前端用 <script src="/api/config.js"> 載入，注入到 window.SUPABASE_URL / SUPABASE_ANON_KEY
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';

  const body =
    'window.SUPABASE_URL = ' + JSON.stringify(url) + ';\n' +
    'window.SUPABASE_ANON_KEY = ' + JSON.stringify(key) + ';\n' +
    'var SUPABASE_URL = window.SUPABASE_URL, SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;\n';

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(body);
};
