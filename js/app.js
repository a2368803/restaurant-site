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
  const heroEl = document.querySelector('.carousel-section');
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
  if (!pixelId || pixelId.trim() === '') return;
  const s = document.createElement('script');
  s.innerHTML = [
    '!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?',
    'n.callMethod.apply(n,arguments):n.queue.push(arguments)};',
    'if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';',
    'n.queue=[];t=b.createElement(e);t.async=!0;',
    't.src=v;s=b.getElementsByTagName(e)[0];',
    's.parentNode.insertBefore(t,s)}(window,document,\'script\',',
    '\'https://connect.facebook.net/en_US/fbevents.js\');',
    'fbq(\'init\',\'' + pixelId.trim() + '\');fbq(\'track\',\'PageView\');'
  ].join('');
  document.head.appendChild(s);
}

// ── Carousel ─────────────────────────────────────────────

function initCarousel(photos) {
  const section = document.querySelector('.carousel-section');
  const track   = document.querySelector('.carousel-track');
  const dotsEl  = document.querySelector('.carousel-dots');

  if (!photos || !photos.length) {
    section.innerHTML = '<div class="carousel-empty">尚未上傳照片</div>';
    return;
  }

  let current = 0;
  let timer   = null;

  photos.forEach(function (photo, i) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';

    let wrapper;
    if (photo.link_url && photo.link_url.trim()) {
      wrapper = document.createElement('a');
      wrapper.href = photo.link_url.trim();
      wrapper.target = '_blank';
      wrapper.rel = 'noopener noreferrer';
    } else {
      wrapper = document.createElement('span');
    }

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = '輪播圖片 ' + (i + 1);
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.draggable = false;

    wrapper.appendChild(img);
    slide.appendChild(wrapper);
    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', '第 ' + (i + 1) + ' 張');
    dot.addEventListener('click', function () { goTo(i); });
    dotsEl.appendChild(dot);
  });

  function goTo(idx) {
    current = (idx + photos.length) % photos.length;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dotsEl.querySelectorAll('.carousel-dot').forEach(function (d, i) {
      d.classList.toggle('active', i === current);
    });
  }

  function startTimer() {
    if (photos.length < 2) return;
    timer = setInterval(function () { goTo(current + 1); }, 4500);
  }
  function stopTimer() { clearInterval(timer); }

  startTimer();

  let tx = 0;
  track.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].screenX;
    stopTimer();
  }, { passive: true });
  track.addEventListener('touchend', function (e) {
    const diff = tx - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
    startTimer();
  }, { passive: true });
}

// ── Apply Settings to DOM ────────────────────────────────

function applySettings(settings) {
  function get(k) {
    const found = settings.find(function (s) { return s.key === k; });
    return found ? (found.value || '') : '';
  }

  const storeName = get('store_name') || '我的餐廳';
  const nameEl = document.getElementById('site-name');
  if (nameEl) nameEl.textContent = storeName;
  document.title = storeName;

  const tagline = get('store_tagline');
  const taglineEl = document.getElementById('site-tagline');
  if (taglineEl) {
    taglineEl.textContent = tagline;
    taglineEl.style.display = tagline ? '' : 'none';
  }

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
  }
  if (photosRes.data) {
    initCarousel(photosRes.data);
  }
}

document.addEventListener('DOMContentLoaded', init);
