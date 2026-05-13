'use strict';

const fs   = require('fs');
const path = require('path');

const SB_URL = 'https://avengltlsvgpsblstmec.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZW5nbHRsc3ZncHNibHN0bWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTU2OTMsImV4cCI6MjA5NDE3MTY5M30.L4ts5n4Of4INT1LmtEnz8iHu2-lOJZXt4NYK7anG1CY';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');

  let ogTitle = '餐廳', ogDesc = '', ogImage = '';

  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?select=key,value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    const rows = await r.json();
    const get  = k => (rows.find(s => s.key === k) || {}).value || '';

    ogTitle = get('og_share_title')       || get('store_name')       || '餐廳';
    ogDesc  = get('og_share_description') || get('meta_description') || '';
    ogImage = get('og_share_image_url')   || '';
  } catch (_) {}

  const out = html
    .replace(/(<title>)[^<]*(<\/title>)/,                                    `$1${esc(ogTitle)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,            `$1${esc(ogTitle)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,           `$1${esc(ogTitle)}$2`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/,             `$1${esc(ogDesc)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/,      `$1${esc(ogDesc)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,     `$1${esc(ogDesc)}$2`)
    .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/,            `$1${esc(ogImage)}$2`)
    .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,           `$1${esc(ogImage)}$2`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.end(out);
};
