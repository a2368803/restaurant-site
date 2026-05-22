'use strict';

// ────────────────────────────────────────────────────────────
// 多租戶前台：依 window.__STORE_SLUG__ / __STORE_ID__ 載入店家
// （由 api/index.js 在 SSR 時注入）
// ────────────────────────────────────────────────────────────

const STORE_SLUG = window.__STORE_SLUG__ || '';
const STORE_ID   = window.__STORE_ID__   || '';
const { createClient } = window.supabase;
let sb = null;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ── Traffic Source Detection ─────────────────────────────

function detectSource() {
  try {
    var params = new URLSearchParams(window.location.search);
    var utm = (params.get('utm_source') || '').toLowerCase();
    if (utm) {
      if (utm === 'fb' || utm.includes('facebook') || utm.includes('messenger')) return 'facebook';
      if (utm === 'ig' || utm.includes('instagram')) return 'instagram';
      if (utm.includes('threads')) return 'threads';
      if (utm.includes('google')) return 'google';
      if (utm.includes('line')) return 'line';
    }
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|\[FBAN/.test(ua)) return 'facebook';
    if (/Instagram/.test(ua))               return 'instagram';
    if (/\bLine\//.test(ua))                return 'line';
    var ref = (document.referrer || '').toLowerCase();
    if (ref.includes('facebook.com') || ref.includes('fb.com') || ref.includes('l.facebook')) return 'facebook';
    if (ref.includes('instagram.com') || ref.includes('l.instagram'))                          return 'instagram';
    if (ref.includes('threads.net')   || ref.includes('l.threads'))                            return 'threads';
    if (ref.includes('line.me')       || ref.includes('liff.line'))                            return 'line';
    if (ref) {
      try {
        var host = new URL(document.referrer).hostname;
        if (/^(www\.)?google\.[a-z.]+$/.test(host)) return 'google';
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

function getUTMParams() {
  try {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source:   (p.get('utm_source')   || '').slice(0, 64),
      utm_medium:   (p.get('utm_medium')   || '').slice(0, 64),
      utm_campaign: (p.get('utm_campaign') || '').slice(0, 128),
      utm_content:  (p.get('utm_content')  || '').slice(0, 128)
    };
  } catch (_) { return {}; }
}

function detectDevice() {
  var ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/.test(ua)) return 'mobile';
  if (/Tablet|iPad/.test(ua))                   return 'tablet';
  return 'desktop';
}

// ── Visitor / Session ────────────────────────────────────

function getSessionId() {
  let id = sessionStorage.getItem('_sid');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('_sid', id);
  }
  return id;
}

function getVisitorId() {
  var key = '_vid';
  var id = localStorage.getItem(key);
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}

// ── Analytics ────────────────────────────────────────────

function trackEvent(type) {
  if (!sb || !STORE_ID) return;
  // 每個 (store, session, event) 只送一次（用 store-aware key 避免不同店互污）
  var key = '_e_' + STORE_SLUG + '_' + type;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');

  var utm = getUTMParams();
  var body = {
    store_id:     STORE_ID,
    event_type:   String(type || '').slice(0, 64),
    session_id:   getSessionId(),
    visitor_id:   getVisitorId(),
    event_date:   new Date().toISOString().slice(0, 10),
    utm_source:   utm.utm_source   || '',
    utm_medium:   utm.utm_medium   || '',
    utm_campaign: utm.utm_campaign || '',
    utm_content:  utm.utm_content  || '',
    referrer:     (document.referrer || '').slice(0, 512),
    device:       detectDevice()
  };

  try {
    fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(body)
    }).catch(function () {});
  } catch (_) {}
}

function initScrollTracking() {
  var heroPassed = false, s33 = false, s67 = false, s100 = false;

  function onScroll() {
    var scrollY = window.pageYOffset !== undefined ? window.pageYOffset
                : (document.documentElement.scrollTop || document.body.scrollTop || 0);
    var totalH = document.documentElement.scrollHeight - window.innerHeight;

    if (!heroPassed && scrollY > window.innerHeight * 0.6) {
      heroPassed = true;
      trackEvent('hero_passed');
    }
    if (totalH <= 0) return;
    var pct = scrollY / totalH;
    if (!s33 && pct >= 0.33) { s33 = true; trackEvent('scroll_33'); }
    if (!s67 && pct >= 0.67) { s67 = true; trackEvent('scroll_67'); }
    if (!s100 && pct >= 0.95) { s100 = true; trackEvent('scroll_100'); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
}

// ── Facebook Pixel ───────────────────────────────────────

function injectPixel(pixelId) {
  var lsKey = '_fbpx_' + STORE_SLUG;
  if (!pixelId || pixelId.trim() === '') {
    localStorage.removeItem(lsKey);
    return;
  }
  var pid = pixelId.trim();
  var cachedPid = localStorage.getItem(lsKey);
  localStorage.setItem(lsKey, pid);

  if (window.fbq) {
    if (cachedPid && cachedPid !== pid) {
      fbq('init', pid);
      fbq('track', 'PageView');
    }
    return;
  }

  var s = document.createElement('script');
  s.innerHTML = [
    '!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?',
    'n.callMethod.apply(n,arguments):n.queue.push(arguments)};',
    'if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';',
    'n.queue=[];t=b.createElement(e);t.async=!0;',
    't.src=v;s=b.getElementsByTagName(e)[0];',
    's.parentNode.insertBefore(t,s)}(window,document,\'script\',',
    '\'https://connect.facebook.net/en_US/fbevents.js\');',
    'fbq(\'init\',\'' + pid + '\');fbq(\'track\',\'PageView\');'
  ].join('');
  document.head.appendChild(s);
}

// ── YouTube helper ───────────────────────────────────────

function getYouTubeId(url) {
  if (!url) return null;
  var patterns = [
    /youtu\.be\/([^?&#/\s]+)/,
    /youtube\.com\/watch\?.*[?&]v=([^?&#/\s]+)/,
    /youtube\.com\/embed\/([^?&#/\s]+)/,
    /youtube\.com\/shorts\/([^?&#/\s]+)/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = url.match(patterns[i]);
    if (m) return m[1];
  }
  return null;
}

// ── Media List ───────────────────────────────────────────

function initMediaList(items) {
  var section = document.getElementById('media-section');
  if (!items || !items.length) {
    section.innerHTML = '<div class="media-empty">尚未新增任何照片或影片</div>';
    return;
  }
  section.innerHTML = '';

  items.forEach(function (item, i) {
    var el = document.createElement('div');
    el.className = 'media-item';

    if (item.media_type === 'youtube') {
      var videoId = getYouTubeId(item.url);
      if (!videoId) return;
      var wrap = document.createElement('div');
      wrap.className = 'video-wrap';
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + videoId + '?rel=0&playsinline=1';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      iframe.title = 'YouTube 影片';
      wrap.appendChild(iframe);
      el.appendChild(wrap);
    } else {
      var img = document.createElement('img');
      img.src = item.url;
      if (item.url_mobile) {
        img.srcset = item.url_mobile + ' 900w, ' + item.url + ' 1920w';
        img.sizes  = '100vw';
      }
      img.alt     = '照片 ' + (i + 1);
      img.loading = i === 0 ? 'eager' : 'lazy';
      if (i === 0) img.fetchPriority = 'high';
      img.draggable = false;

      if (item.link_url && item.link_url.trim()) {
        var a = document.createElement('a');
        a.href = item.link_url.trim();
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.appendChild(img);
        el.appendChild(a);
      } else {
        el.appendChild(img);
      }
    }
    section.appendChild(el);
  });
}

// ── SEO / GEO ────────────────────────────────────────────

function setMeta(nameOrProp, content) {
  if (!content) return;
  var isOG = nameOrProp.indexOf(':') !== -1;
  var selector = isOG
    ? 'meta[property="' + nameOrProp + '"]'
    : 'meta[name="' + nameOrProp + '"]';
  var el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(isOG ? 'property' : 'name', nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function updateSEO(settings, firstImageUrl) {
  function get(k) {
    var f = settings.find(function (s) { return s.key === k; });
    return f ? (f.value || '') : '';
  }

  var name     = get('store_name') || '我的店';
  var desc     = get('meta_description') || (name + ' — 歡迎來電訂位或線上預約');
  var cuisine  = get('cuisine_type');
  var price    = get('price_range');
  var hours    = get('opening_hours_text');
  var phone    = get('phone_number');
  var address  = get('address_text');
  var resUrl   = get('reservation_url');
  var keywords = get('seo_keywords') || (name + (cuisine ? ',' + cuisine : '') + ',訂位');
  var siteUrl  = window.location.origin + '/' + STORE_SLUG;

  document.title = name;
  setMeta('description', desc);
  setMeta('keywords', keywords);
  setMeta('geo.placename', address || name);
  setMeta('og:site_name',   name);
  setMeta('og:title',       name);
  setMeta('og:description', desc);
  setMeta('og:url',         siteUrl);
  if (firstImageUrl) setMeta('og:image', firstImageUrl);
  setMeta('twitter:title',       name);
  setMeta('twitter:description', desc);
  if (firstImageUrl) setMeta('twitter:image', firstImageUrl);

  var schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    'name': name,
    'url': siteUrl,
    'description': desc
  };
  if (phone)   schema.telephone = phone;
  if (address) schema.address = { '@type': 'PostalAddress', 'streetAddress': address, 'addressLocality': '台灣', 'addressCountry': 'TW' };
  if (cuisine) schema.servesCuisine = cuisine;
  if (price)   schema.priceRange = price;
  if (resUrl)  { schema.reservations = resUrl; schema.acceptsReservations = 'True'; }
  if (firstImageUrl) schema.image = firstImageUrl;
  if (hours)   schema.openingHours = hours.split('\n').map(function(l){return l.trim();}).filter(Boolean);

  var faqs = [];
  if (address) faqs.push({ q: name + ' 地址在哪裡？', a: '地址：' + address });
  if (phone)   faqs.push({ q: '如何聯絡 ' + name + '？', a: '電話：' + phone });
  if (hours)   faqs.push({ q: name + ' 的營業時間是？', a: hours });
  if (cuisine) faqs.push({ q: name + ' 提供什麼料理？', a: '提供' + cuisine + '料理。' });
  if (price)   faqs.push({ q: name + ' 的價位大約是多少？', a: '價位：' + price });
  if (resUrl)  faqs.push({ q: '如何在 ' + name + ' 訂位？', a: '可透過線上訂位系統預約：' + resUrl });

  var ldBlocks = [schema];
  if (faqs.length) {
    ldBlocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': faqs.map(function (f) {
        return { '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } };
      })
    });
  }

  var ldEl = document.getElementById('json-ld');
  if (!ldEl) {
    ldEl = document.createElement('script');
    ldEl.id = 'json-ld';
    ldEl.type = 'application/ld+json';
    document.head.appendChild(ldEl);
  }
  ldEl.textContent = JSON.stringify(ldBlocks, null, 0);

  var seoEl = document.getElementById('seo-content');
  if (seoEl) {
    var lines = ['<h1>' + esc(name) + '</h1>'];
    if (desc)    lines.push('<p>' + esc(desc) + '</p>');
    if (cuisine) lines.push('<p>料理類型：' + esc(cuisine) + '</p>');
    if (price)   lines.push('<p>價位：' + esc(price) + '</p>');
    if (address) lines.push('<address>地址：' + esc(address) + '</address>');
    if (phone)   lines.push('<p>電話：<a href="tel:' + esc(phone.replace(/\s/g,'')) + '">' + esc(phone) + '</a></p>');
    if (hours)   lines.push('<p>營業時間：' + esc(hours.replace(/\n/g,'、')) + '</p>');
    if (resUrl)  lines.push('<p>線上訂位：<a href="' + esc(resUrl) + '">' + esc(resUrl) + '</a></p>');
    seoEl.innerHTML = lines.join('');
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Apply Settings to DOM ────────────────────────────────

function applySettings(settings) {
  function get(k) {
    const found = settings.find(function (s) { return s.key === k; });
    return found ? (found.value || '') : '';
  }

  const storeName = get('store_name') || '我的店';
  document.title = storeName;

  const footerEl = document.getElementById('footer-name');
  if (footerEl) footerEl.textContent = '© ' + new Date().getFullYear() + ' ' + storeName;

  const phone = get('phone_number');
  const callBtn = document.getElementById('cta-call');
  if (callBtn) {
    if (phone) {
      callBtn.href = 'tel:' + phone.replace(/\s/g, '');
      callBtn.classList.remove('hidden');
    } else {
      callBtn.classList.add('hidden');
    }
  }

  const resUrl = get('reservation_url');
  const resBtn = document.getElementById('cta-reservation');
  if (resBtn) {
    if (resUrl) {
      resBtn.href = resUrl;
      resBtn.classList.remove('hidden');
    } else {
      resBtn.classList.add('hidden');
    }
  }

  const addrText = get('address_text');
  const addrSection = document.getElementById('address-section');
  const addrTextEl  = document.getElementById('address-text');
  if (addrSection) {
    if (addrText) {
      if (addrTextEl) addrTextEl.textContent = addrText;
      addrSection.style.display = '';
    } else {
      addrSection.style.display = 'none';
    }
  }

  const mapsUrl = get('google_maps_embed_url');
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) {
    if (mapsUrl) {
      // 用 DOM API 而非 innerHTML 插入 iframe，避免 XSS
      mapWrapper.innerHTML = '';
      const shield = document.createElement('div');
      shield.className = 'map-click-shield';
      shield.onclick = function () { this.style.display = 'none'; };
      const iframe = document.createElement('iframe');
      iframe.src = mapsUrl;
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      mapWrapper.appendChild(shield);
      mapWrapper.appendChild(iframe);
      mapWrapper.style.display = '';
    } else {
      mapWrapper.style.display = 'none';
    }
  }

  injectPixel(get('facebook_pixel_id'));
}

// ── Promo Popup ──────────────────────────────────────────

function initPromo(settings) {
  function get(k) {
    const found = settings.find(function (s) { return s.key === k; });
    return found ? (found.value || '') : '';
  }

  if (get('promo_active') !== 'true') return;
  const title   = get('promo_title');
  const content = get('promo_content');
  if (!title && !content) return;

  const overlay = document.getElementById('promo-overlay');
  const titleEl = document.getElementById('promo-popup-title');
  const imgEl   = document.getElementById('promo-img');
  const bodyEl  = document.getElementById('promo-body');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.textContent  = content;

  const imgUrl = get('promo_image_url');
  if (imgEl) {
    if (imgUrl) { imgEl.src = imgUrl; imgEl.style.display = 'block'; }
    else imgEl.style.display = 'none';
  }

  if (overlay) overlay.classList.remove('hidden');
}

// ── Main Init ────────────────────────────────────────────

async function init() {
  const ready = initSupabase();
  if (!STORE_ID) {
    var section = document.getElementById('media-section');
    if (section) section.innerHTML = '<div class="media-empty" style="padding:60px 20px;text-align:center;">找不到店家</div>';
    return;
  }

  // CTA click tracking
  const resBtn  = document.getElementById('cta-reservation');
  const callBtn = document.getElementById('cta-call');
  if (resBtn)  resBtn.addEventListener('click',  function () { trackEvent('reservation_click'); });
  if (callBtn) callBtn.addEventListener('click', function () { trackEvent('call_click'); });

  const promoClose = document.getElementById('promo-close');
  if (promoClose) {
    promoClose.addEventListener('click', function () {
      const overlay = document.getElementById('promo-overlay');
      if (overlay) overlay.classList.add('hidden');
    });
  }

  if (!ready) return;

  trackEvent('page_view');
  // 新舊客判斷：用 store-specific localStorage key
  var visitedKey = '_visited_' + STORE_SLUG;
  var _isNew = !localStorage.getItem(visitedKey);
  localStorage.setItem(visitedKey, '1');
  trackEvent(_isNew ? 'new_visitor' : 'returning_visitor');
  var _src = detectSource();
  if (_src) trackEvent('source_' + _src);
  initScrollTracking();

  var mediaSection = document.getElementById('media-section');
  if (mediaSection && !mediaSection.children.length) {
    mediaSection.innerHTML = '<div class="media-placeholder"></div>';
  }

  // 快取（store-aware key）
  var cacheKey = '_settings_cache_' + STORE_SLUG;
  var cachedSettings = null;
  try {
    var raw = localStorage.getItem(cacheKey);
    if (raw) cachedSettings = JSON.parse(raw);
  } catch (_) {}
  if (cachedSettings) {
    applySettings(cachedSettings);
    initPromo(cachedSettings);
  }

  const [settingsRes, photosRes] = await Promise.all([
    sb.from('settings').select('key,value').eq('store_id', STORE_ID),
    sb.from('photos').select('*').eq('store_id', STORE_ID).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  ]);

  if (settingsRes.data) {
    try { localStorage.setItem(cacheKey, JSON.stringify(settingsRes.data)); } catch (_) {}
    applySettings(settingsRes.data);
    if (!cachedSettings) initPromo(settingsRes.data);
    var firstImage = photosRes.data && photosRes.data.find(function (p) { return p.media_type !== 'youtube'; });
    updateSEO(settingsRes.data, firstImage ? firstImage.url : '');
  }
  if (photosRes.data) {
    initMediaList(photosRes.data);
  }
}

document.addEventListener('DOMContentLoaded', init);
