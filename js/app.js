'use strict';

const { createClient } = window.supabase;
let sb = null;

function initSupabase() {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'YOUR_SUPABASE_URL') return false;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
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

async function trackEvent(type) {
  if (!sb) return;
  if (sessionStorage.getItem('_e_' + type)) return;
  sessionStorage.setItem('_e_' + type, '1');
  try {
    await sb.from('analytics_events').insert({
      event_type: type,
      session_id: getSessionId(),
      event_date: new Date().toISOString().slice(0, 10)
    });
  } catch (_) {}
}

function initScrollTracking() {
  const heroEl = document.getElementById('media-section');
  let heroPassed = false, s33 = false, s67 = false, s100 = false;

  window.addEventListener('scroll', function () {
    const scrollY = window.scrollY;
    const totalH = document.documentElement.scrollHeight - window.innerHeight;

    if (!heroPassed && heroEl && scrollY > heroEl.offsetHeight) {
      heroPassed = true;
      trackEvent('hero_passed');
    }
    if (totalH <= 0) return;
    const pct = scrollY / totalH;
    if (!s33 && pct >= 0.33) { s33 = true; trackEvent('scroll_33'); }
    if (!s67 && pct >= 0.67) { s67 = true; trackEvent('scroll_67'); }
    if (!s100 && pct >= 0.99) { s100 = true; trackEvent('scroll_100'); }
  }, { passive: true });
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
      img.alt = '照片 ' + (i + 1);
      img.loading = i === 0 ? 'eager' : 'lazy';
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
  var siteUrl  = 'https://a2368803.github.io/restaurant-site/';

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
      mapWrapper.innerHTML = '<iframe src="' + mapsUrl + '" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
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
  initScrollTracking();

  const [settingsRes, photosRes] = await Promise.all([
    sb.from('settings').select('*'),
    sb.from('photos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  ]);

  if (settingsRes.data) {
    applySettings(settingsRes.data);
    initPromo(settingsRes.data);
    // 取第一張圖片作為 OG Image
    var firstImage = photosRes.data && photosRes.data.find(function (p) { return p.media_type !== 'youtube'; });
    updateSEO(settingsRes.data, firstImage ? firstImage.url : '');
  }
  if (photosRes.data) {
    initMediaList(photosRes.data);
  }
}

document.addEventListener('DOMContentLoaded', init);
