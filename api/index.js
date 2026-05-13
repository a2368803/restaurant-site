'use strict';

const SB_URL = 'https://avengltlsvgpsblstmec.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZW5nbHRsc3ZncHNibHN0bWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTU2OTMsImV4cCI6MjA5NDE3MTY5M30.L4ts5n4Of4INT1LmtEnz8iHu2-lOJZXt4NYK7anG1CY';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  // Fetch index.html as a static file — rewrite only intercepts '/', not '/index.html'
  const proto = ((req.headers['x-forwarded-proto'] || 'https') + '').split(',')[0].trim();
  const host  = req.headers.host;
  let html = '';
  try {
    html = await fetch(`${proto}://${host}/index.html`).then(r => r.text());
  } catch (_) {
    res.statusCode = 500;
    res.end('Error loading page');
    return;
  }

  let ogTitle = '餐廳', ogDesc = '', ogImage = '', ogW = '', ogH = '';

  try {
    const r    = await fetch(`${SB_URL}/rest/v1/settings?select=key,value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    const rows = await r.json();
    const get  = k => (rows.find(s => s.key === k) || {}).value || '';

    ogTitle = get('og_share_title')       || get('store_name')       || '餐廳';
    ogDesc  = get('og_share_description') || get('meta_description') || '';
    ogImage = get('og_share_image_url')   || '';
    ogW     = get('og_share_image_width')  || '';
    ogH     = get('og_share_image_height') || '';
  } catch (_) {}

  // Inject OG values — [^>]* handles extra whitespace between attributes
  const out = html
    .replace(/(<title>)[^<]*(<\/title>)/,                                          `$1${esc(ogTitle)}$2`)
    .replace(/(<meta[^>]+property="og:title"[^>]+content=")[^"]*(")/,             `$1${esc(ogTitle)}$2`)
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
