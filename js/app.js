'use strict';

const { createClient } = window.supabase;
let sb = null;

function initSupabase() {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'YOUR_SUPABASE_URL') return false;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ── Traffic Source Detection ─────────────────────────────

function detectSource() {
  try {
    // 1. UTM 參數最可靠，優先判斷
    var params = new URLSearchParams(window.location.search);
    var utm = (params.get('utm_source') || '').toLowerCase();
    if (utm) {
      if (utm === 'fb' || utm.includes('facebook') || utm.includes('messenger')) return 'facebook';
      if (utm === 'ig' || utm.includes('instagram')) return 'instagram';
      if (utm.includes('threads')) return 'threads';
      if (utm.includes('google')) return 'google';
      if (utm.includes('line')) return 'line';
    }

    // 2. User-Agent 偵測（App 內建瀏覽器常不帶 Referrer，靠 UA 補救）
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|\[FBAN/.test(ua)) return 'facebook';
    if (/Instagram/.test(ua))               return 'instagram';
    if (/\bLine\//.test(ua))                return 'line';

    // 3. Referrer 偵測
    var ref = (document.referrer || '').toLowerCase();
    if (ref.includes('facebook.com') || ref.includes('fb.com') || ref.includes('l.facebook')) return 'facebook';
    if (ref.includes('instagram.com') || ref.includes('l.instagram'))                          return 'instagram';
    if (ref.includes('threads.net')   || ref.includes('l.threads'))                            return 'threads';
    if (ref.includes('line.me')       || ref.includes('liff.line'))                            return 'line';

    // Google 只算根網域搜尋（排除 mail / maps / accounts / docs 等子網域）
    if (ref) {
      try {
        var host = new URL(document.referrer).hostname;
        if (/^(www\.)?google\.[a-z.]+$/.test(host)) return 'google';
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

// ── Session & Analytics ──────────────────────────────────

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

function trackEvent(type) {
  if (!sb) return;
  if (sessionStorage.getItem('_e_' + type)) return;
  sessionStorage.setItem('_e_' + type, '1');
  try {
    // keepalive: true ensures the request survives page close/unload,
    // which is critical for scroll milestone events (scroll_33, scroll_67, etc.)
    fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        event_type: type,
        session_id: getSessionId(),
        event_date: new Date().toISOString().slice(0, 10)
      })
    }).catch(function () {});
  } catch (_) {}
}

function initScrollTracking() {
  var heroPassed = false, s33 = false, s67 = false, s100 = false;

  function onScroll() {
    // pageYOffset is more compatible with in-app browsers than scrollY
    var scrollY = window.pageYOffset !== undefined ? window.pageYOffset
                : (document.documentElement.scrollTop || document.body.scrollTop || 0);
    var totalH = document.documentElement.scrollHeight - window.innerHeight;

    // hero_passed: user scrolled past 60% of viewport = engaged, saw first photo
    if (!heroPassed && scrollY > window.innerHeight * 0.6) {
      heroPassed = true;
      trackEvent('hero_passed');
    }
    if (totalH <= 0) return;
    var pct = scrollY / totalH;
    if (!s33 && pct >= 0.33) { s33 = true; trackEvent('scroll_33'); }
    if (!s67 && pct >= 0.67) { s67 = true; trackEvent('scroll_67'); }
    // 0.95 instead of 0.99: iOS address bar shrinks on scroll, totalH shifts dynamically
    if (!s100 && pct >= 0.95) { s100 = true; trackEvent('scroll_100'); }
  }

  // Listen on both: IG/FB in-app WebViews sometimes only fire document scroll
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
}

// ── Facebook Pixel ───────────────────────────────────────

function injectPixel(pixelId) {
  if (!pixelId || pixelId.trim() === '') {
    localStorage.removeItem('_fbpx');
    return;
  }
  var pid = pixelId.trim();
  var cachedPid = localStorage.getItem('_fbpx');

  // 更新快取，讓下次訪問能立即從 <head> 觸發
  localStorage.setItem('_fbpx', pid);

  if (window.fbq) {
    // Pixel 已由 <head> 快取腳本初始化
    // 若 Pixel ID 有變更，補充註冊新 ID 並補送 PageView
    if (cachedPid && cachedPid !== pid) {
      fbq('init', pid);
      fbq('track', 'PageView');
    }
    return;
  }

  // 首次訪問（尚無快取）：現在注入並觸發
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

// ── Media List（照片 + 影片依序排列）────────────────────

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

  var name     = get('store_name') || '我的餐廳';
  var desc     = get('meta_description') || (name + ' — 提供精緻料理，歡迎來電訂位或線上預約');
  var cuisine  = get('cuisine_type');
  var price    = get('price_range');
  var hours    = get('opening_hours_text');
  var phone    = get('phone_number');
  var address  = get('address_text');
  var resUrl   = get('reservation_url');
  var keywords = get('seo_keywords') || (name + (cuisine ? ',' + cuisine : '') + ',餐廳,訂位,美食,台灣');
  var siteUrl  = 'https://wadawww.vercel.app/';

  // ── 基礎 meta ──
  document.title = name;
  setMeta('description', desc);
  setMeta('keywords', keywords);
  setMeta('geo.placename', address || name);

  // ── Open Graph ──
  setMeta('og:site_name',   name);
  setMeta('og:title',       name);
  setMeta('og:description', desc);
  if (firstImageUrl) setMeta('og:image', firstImageUrl);

  // ── Twitter Card ──
  setMeta('twitter:title',       name);
  setMeta('twitter:description', desc);
  if (firstImageUrl) setMeta('twitter:image', firstImageUrl);

  // ── JSON-LD：Restaurant Schema（本地 SEO）──
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

  // ── JSON-LD：FAQPage Schema（GEO — AI 搜尋引擎優化）──
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

  // ── 隱藏語意內容區（給爬蟲讀，不影響視覺）──
  var seoEl = document.getElementById('seo-content');
  if (seoEl) {
    var lines = ['<h1>' + name + '</h1>'];
    if (desc)    lines.push('<p>' + desc + '</p>');
    if (cuisine) lines.push('<p>料理類型：' + cuisine + '</p>');
    if (price)   lines.push('<p>價位：' + price + '</p>');
    if (address) lines.push('<address>地址：' + address + '</address>');
    if (phone)   lines.push('<p>電話：<a href="tel:' + phone.replace(/\s/g,'') + '">' + phone + '</a></p>');
    if (hours)   lines.push('<p>營業時間：' + hours.replace(/\n/g,'、') + '</p>');
    if (resUrl)  lines.push('<p>線上訂位：<a href="' + resUrl + '">' + resUrl + '</a></p>');
    seoEl.innerHTML = lines.join('');
  }
}

// ── Apply Settings to DOM ────────────────────────────────

function applySettings(settings) {
  function get(k) {
    const found = settings.find(function (s) { return s.key === k; });
    return found ? (found.value || '') : '';
  }

  const storeName = get('store_name') || '我的餐廳';
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
      mapWrapper.innerHTML =
        '<div class="map-click-shield" onclick="this.style.display=\'none\'"></div>' +
        '<iframe src="' + mapsUrl + '" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
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

  // Reservation click tracking (attach early)
  const resBtn = document.getElementById('cta-reservation');
  if (resBtn) resBtn.addEventListener('click', function () { trackEvent('reservation_click'); });

  // Promo close
  const promoClose = document.getElementById('promo-close');
  if (promoClose) {
    promoClose.addEventListener('click', function () {
      const overlay = document.getElementById('promo-overlay');
      if (overlay) overlay.classList.add('hidden');
    });
  }

  if (!ready) return;

  trackEvent('page_view');
  var _src = detectSource();
  if (_src) trackEvent('source_' + _src);
  initScrollTracking();

  // Skeleton placeholder keeps page layout stable while photos load
  var mediaSection = document.getElementById('media-section');
  if (mediaSection && !mediaSection.children.length) {
    mediaSection.innerHTML = '<div class="media-placeholder"></div>';
  }

  // Apply cached settings immediately so page renders without waiting for API
  var cachedSettings = null;
  try {
    var raw = localStorage.getItem('_settings_cache');
    if (raw) cachedSettings = JSON.parse(raw);
  } catch (_) {}
  if (cachedSettings) {
    applySettings(cachedSettings);
    initPromo(cachedSettings);
  }

  const [settingsRes, photosRes] = await Promise.all([
    sb.from('settings').select('*'),
    sb.from('photos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  ]);

  if (settingsRes.data) {
    try { localStorage.setItem('_settings_cache', JSON.stringify(settingsRes.data)); } catch (_) {}
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
