'use strict';

// ────────────────────────────────────────────────────────────
// /[slug] SSR — 抓店家設定 + 首圖，注入 OG meta 與 image preload
// ────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_ANON_KEY || '';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function notFoundHtml(slug) {
  const safe = esc(slug || '');
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>店家不存在</title>
<style>
body{font-family:'Noto Sans TC',system-ui,sans-serif;background:#fdf8f3;color:#3a2d1f;
  display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;
  margin:0;padding:24px;text-align:center;}
h1{font-size:1.8rem;color:#8b5e3c;margin:0 0 12px;}
p{color:#8b7355;margin:0 0 24px;}
a{background:#8b5e3c;color:#fff;padding:12px 24px;border-radius:10px;
  text-decoration:none;font-weight:600;}
</style></head><body>
<h1>🏪 找不到這家店</h1>
<p>網址 <code>/${safe}</code> 沒有對應的店家，或店家已停用。</p>
<a href="/">回首頁</a>
</body></html>`;
}

module.exports = async (req, res) => {
  const slug = (req.query && req.query.slug ? String(req.query.slug) : '').toLowerCase();

  if (!slug || !/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(notFoundHtml(slug));
    return;
  }

  if (!SB_URL || !SB_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Server not configured: SUPABASE_URL / SUPABASE_ANON_KEY missing');
    return;
  }

  // 1. 確認 slug 對應 store
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  let store = null;
  try {
    const arr = await fetch(
      `${SB_URL}/rest/v1/stores?select=id,name,slug,is_active&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`,
      { headers }
    ).then(r => r.json());
    if (Array.isArray(arr) && arr.length) store = arr[0];
  } catch (_) {}

  if (!store) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(notFoundHtml(slug));
    return;
  }

  // 2. 抓 store.html 模板 + settings + 首圖（並行）
  const proto = ((req.headers['x-forwarded-proto'] || 'https') + '').split(',')[0].trim();
  const host  = req.headers.host;
  let html = '';
  let settings = [];
  let photos = [];

  try {
    const [htmlRes, settingsRes, photosRes] = await Promise.all([
      fetch(`${proto}://${host}/store.html`).then(r => r.text()),
      fetch(`${SB_URL}/rest/v1/settings?select=key,value&store_id=eq.${store.id}`, { headers }).then(r => r.json()),
      fetch(`${SB_URL}/rest/v1/photos?select=url,url_mobile,media_type&store_id=eq.${store.id}&order=sort_order.asc,created_at.asc&limit=5`, { headers }).then(r => r.json())
    ]);
    html = htmlRes || '';
    settings = Array.isArray(settingsRes) ? settingsRes : [];
    photos = Array.isArray(photosRes) ? photosRes : [];
  } catch (e) {
    res.statusCode = 500;
    res.end('Error loading page');
    return;
  }

  if (!html) {
    res.statusCode = 500;
    res.end('Template missing');
    return;
  }

  const get = k => (settings.find(s => s.key === k) || {}).value || '';
  const ogTitle = get('og_share_title')       || get('store_name')       || store.name || '店家';
  const ogDesc  = get('og_share_description') || get('meta_description') || '';
  const ogImage = get('og_share_image_url')   || '';
  const ogW     = get('og_share_image_width')  || '';
  const ogH     = get('og_share_image_height') || '';
  const canonical = `${proto}://${host}/${slug}`;

  // 首圖 preload
  const firstPhoto = photos.find(p => p.media_type !== 'youtube');
  let preloadTag = '';
  if (firstPhoto && firstPhoto.url) {
    const srcsetAttr = firstPhoto.url_mobile
      ? ` imagesrcset="${esc(firstPhoto.url_mobile)} 900w, ${esc(firstPhoto.url)} 1920w" imagesizes="100vw"`
      : '';
    preloadTag = `<link rel="preload" as="image" href="${esc(firstPhoto.url)}" fetchpriority="high"${srcsetAttr}>`;
  }

  // 把 slug 傳給前端 JS：注入 window.__STORE_SLUG__ 與 __STORE_ID__
  const storeBootstrap = `<script>window.__STORE_SLUG__=${JSON.stringify(slug)};window.__STORE_ID__=${JSON.stringify(store.id)};</script>`;

  const out = html
    .replace('<!-- ── FIRST_IMAGE_PRELOAD ── injected by api/index.js ── -->', preloadTag + storeBootstrap)
    .replace(/(<title>)[^<]*(<\/title>)/,                                          `$1${esc(ogTitle)}$2`)
    .replace(/(<link[^>]+rel="canonical"[^>]+href=")[^"]*(")/,                    `$1${esc(canonical)}$2`)
    .replace(/(<meta[^>]+property="og:title"[^>]+content=")[^"]*(")/,             `$1${esc(ogTitle)}$2`)
    .replace(/(<meta[^>]+property="og:url"[^>]+content=")[^"]*(")/,               `$1${esc(canonical)}$2`)
    .replace(/(<meta[^>]+name="twitter:title"[^>]+content=")[^"]*(")/,            `$1${esc(ogTitle)}$2`)
    .replace(/(<meta[^>]+name="description"[^>]+content=")[^"]*(")/,              `$1${esc(ogDesc)}$2`)
    .replace(/(<meta[^>]+property="og:description"[^>]+content=")[^"]*(")/,       `$1${esc(ogDesc)}$2`)
    .replace(/(<meta[^>]+name="twitter:description"[^>]+content=")[^"]*(")/,      `$1${esc(ogDesc)}$2`)
    .replace(/(<meta[^>]+property="og:image"[^>]+content=")[^"]*(")/,             `$1${esc(ogImage)}$2`)
    .replace(/(<meta[^>]+name="twitter:image"[^>]+content=")[^"]*(")/,            `$1${esc(ogImage)}$2`)
    .replace(/(<meta[^>]+property="og:image:width"[^>]+content=")[^"]*(")/,       `$1${esc(ogW)}$2`)
    .replace(/(<meta[^>]+property="og:image:height"[^>]+content=")[^"]*(")/,      `$1${esc(ogH)}$2`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.end(out);
};
