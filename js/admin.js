'use strict';

const { createClient } = window.supabase;
let sb = null;

// ── Init ─────────────────────────────────────────────────

function initSupabase() {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    document.getElementById('setup-banner').style.display = 'block';
    return false;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ── Auth ─────────────────────────────────────────────────

function showLogin()  { document.getElementById('login-screen').style.display = 'flex'; document.getElementById('admin-screen').style.display = 'none'; }
function showAdmin()  { document.getElementById('login-screen').style.display = 'none'; document.getElementById('admin-screen').style.display = 'block'; loadTab('analytics'); }

document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '登入中…';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = '登入失敗：帳號或密碼錯誤';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '登入後台';
  }
});

document.getElementById('logout-btn').addEventListener('click', function () {
  sb.auth.signOut();
});

// ── Tab Nav ──────────────────────────────────────────────

let activeTab = 'analytics';

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
    document.querySelectorAll('.tab-content').forEach(function (c) {
      c.classList.toggle('active', c.id === 'tab-' + activeTab);
    });
    loadTab(activeTab);
  });
});

function loadTab(tab) {
  if (tab === 'analytics') loadAnalytics();
  if (tab === 'photos')    loadPhotos();
  if (tab === 'settings')  loadSettings();
  if (tab === 'promo')     loadPromo();
}

// ── Analytics ────────────────────────────────────────────

async function loadAnalytics() {
  const container = document.getElementById('analytics-content');
  container.innerHTML = '<div class="loading">載入數據中</div>';

  const today = new Date().toISOString().slice(0, 10);

  const { data: events, error } = await sb
    .from('analytics_events')
    .select('event_type, session_id')
    .eq('event_date', today);

  if (error || !events) {
    container.innerHTML = '<p style="color:#e05252;text-align:center;padding:20px;">載入失敗，請重試</p>';
    return;
  }

  // Aggregate per session
  const sessions = {};
  events.forEach(function (ev) {
    if (!sessions[ev.session_id]) sessions[ev.session_id] = {};
    sessions[ev.session_id][ev.event_type] = true;
  });

  const sessionArr = Object.values(sessions);
  const total = sessionArr.length;

  function count(type) { return sessionArr.filter(function (s) { return s[type]; }).length; }
  function pct(n) { return total > 0 ? Math.round(n / total * 100) + '%' : '—'; }

  const visitors   = count('page_view');
  const heroPassed = count('hero_passed');
  const s33        = count('scroll_33');
  const s67        = count('scroll_67');
  const s100       = count('scroll_100');
  const resClick   = count('reservation_click');

  const bounce33 = total > 0 ? Math.round(Math.max(0, s33 - s67) / total * 100) + '%' : '—';
  const bounce67 = total > 0 ? Math.round(Math.max(0, s67 - s100) / total * 100) + '%' : '—';

  const stats = [
    { label: '今日進站',    value: visitors + ' 人', hint: '不重複訪客 session' },
    { label: '首圖留存率',  value: pct(heroPassed),  hint: '滑過首圖的比例' },
    { label: '1/3 跳出率',  value: bounce33,          hint: '看到 1/3 後離開' },
    { label: '2/3 跳出率',  value: bounce67,          hint: '看到 2/3 後離開' },
    { label: '看完率',      value: pct(s100),         hint: '滑到底部的比例' },
    { label: '訂位點擊率',  value: pct(resClick),     hint: '點擊訂位按鈕比例' }
  ];

  container.innerHTML =
    '<div class="tab-title">今日數據 <span class="badge">' + today + '</span></div>' +
    '<div class="stat-grid">' +
    stats.map(function (s) {
      return '<div class="stat-card"><span class="stat-value">' + s.value + '</span><span class="stat-label">' + s.label + '</span></div>';
    }).join('') +
    '</div>' +
    '<p class="analytics-note">數據反映今日截至目前的訪客行為，每次開啟自動更新</p>';
}

// ── Photos ───────────────────────────────────────────────

let allPhotos = [];

async function loadPhotos() {
  const list = document.getElementById('photos-list');
  list.innerHTML = '<div class="loading">載入照片中</div>';

  const { data, error } = await sb
    .from('photos')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) { list.innerHTML = '<p style="color:#e05252;text-align:center;padding:20px;">載入失敗</p>'; return; }

  allPhotos = data || [];
  renderPhotos();
}

function renderPhotos() {
  const list = document.getElementById('photos-list');

  if (!allPhotos.length) {
    list.innerHTML = '<p class="empty-msg">尚未上傳任何照片，點擊上方按鈕上傳</p>';
    return;
  }

  list.innerHTML = allPhotos.map(function (photo, i) {
    return [
      '<div class="photo-item" data-id="' + photo.id + '">',
      '  <img src="' + photo.url + '" alt="照片" class="photo-thumb">',
      '  <div class="photo-info">',
      '    <input type="url" class="photo-link-input" data-id="' + photo.id + '"',
      '      value="' + (photo.link_url || '') + '" placeholder="點擊後開啟的連結網址（選填）">',
      '    <div class="photo-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">',
      (i > 0 ? '<button class="btn-sm" onclick="movePhoto(\'' + photo.id + '\',\'up\')">↑ 上移</button>' : ''),
      (i < allPhotos.length - 1 ? '<button class="btn-sm" onclick="movePhoto(\'' + photo.id + '\',\'down\')">↓ 下移</button>' : ''),
      '<button class="btn-sm primary" onclick="savePhotoLink(\'' + photo.id + '\')">儲存連結</button>',
      '<button class="btn-sm danger"  onclick="deletePhoto(\'' + photo.id + '\',\'' + photo.storage_path + '\')">刪除</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
  }).join('');
}

document.getElementById('photo-upload').addEventListener('change', async function (e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const labelEl = document.getElementById('upload-label-text');
  labelEl.textContent = '上傳中…';

  for (const file of files) {
    const ext  = file.name.split('.').pop();
    const path = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;

    const { error: upErr } = await sb.storage.from('photos').upload(path, file);
    if (upErr) { showToast('上傳失敗：' + upErr.message, 'error'); continue; }

    const { data: pubData } = sb.storage.from('photos').getPublicUrl(path);

    await sb.from('photos').insert({
      storage_path: path,
      url:          pubData.publicUrl,
      link_url:     '',
      sort_order:   Date.now()
    });
  }

  labelEl.textContent = '+ 上傳照片';
  e.target.value = '';
  showToast('上傳成功！');
  loadPhotos();
});

async function savePhotoLink(id) {
  const input = document.querySelector('.photo-link-input[data-id="' + id + '"]');
  const { error } = await sb.from('photos').update({ link_url: input.value }).eq('id', id);
  if (error) { showToast('儲存失敗', 'error'); return; }
  showToast('連結已儲存');
}

async function deletePhoto(id, storagePath) {
  if (!confirm('確定要刪除這張照片嗎？')) return;
  await sb.storage.from('photos').remove([storagePath]);
  await sb.from('photos').delete().eq('id', id);
  showToast('已刪除照片');
  loadPhotos();
}

async function movePhoto(id, dir) {
  const idx = allPhotos.findIndex(function (p) { return p.id === id; });
  if (idx === -1) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= allPhotos.length) return;

  const a = allPhotos[idx];
  const b = allPhotos[targetIdx];

  await Promise.all([
    sb.from('photos').update({ sort_order: b.sort_order }).eq('id', a.id),
    sb.from('photos').update({ sort_order: a.sort_order }).eq('id', b.id)
  ]);

  loadPhotos();
}

// ── Settings ─────────────────────────────────────────────

async function loadSettings() {
  const { data, error } = await sb.from('settings').select('*');
  if (error || !data) return;

  function get(k) {
    const f = data.find(function (s) { return s.key === k; });
    return f ? (f.value || '') : '';
  }

  document.getElementById('s-store-name').value    = get('store_name');
  document.getElementById('s-store-tagline').value = get('store_tagline');
  document.getElementById('s-phone').value         = get('phone_number');
  document.getElementById('s-res-url').value       = get('reservation_url');
  document.getElementById('s-fb-pixel').value      = get('facebook_pixel_id');
  document.getElementById('s-address').value       = get('address_text');
  document.getElementById('s-maps').value          = get('google_maps_embed_url');
}

document.getElementById('settings-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = document.getElementById('save-settings-btn');
  btn.disabled = true;
  btn.textContent = '儲存中…';

  const pairs = [
    ['store_name',           document.getElementById('s-store-name').value],
    ['store_tagline',        document.getElementById('s-store-tagline').value],
    ['phone_number',         document.getElementById('s-phone').value],
    ['reservation_url',      document.getElementById('s-res-url').value],
    ['facebook_pixel_id',    document.getElementById('s-fb-pixel').value],
    ['address_text',         document.getElementById('s-address').value],
    ['google_maps_embed_url',document.getElementById('s-maps').value]
  ];

  const upserts = pairs.map(function (p) { return { key: p[0], value: p[1] }; });
  const { error } = await sb.from('settings').upsert(upserts, { onConflict: 'key' });

  btn.disabled = false;
  btn.textContent = '儲存設定';

  if (error) { showToast('儲存失敗：' + error.message, 'error'); return; }
  showToast('設定已儲存！');
});

// ── Promo ────────────────────────────────────────────────

async function loadPromo() {
  const { data, error } = await sb.from('settings').select('*');
  if (error || !data) return;

  function get(k) {
    const f = data.find(function (s) { return s.key === k; });
    return f ? (f.value || '') : '';
  }

  document.getElementById('promo-toggle').checked        = get('promo_active') === 'true';
  document.getElementById('promo-title-input').value     = get('promo_title');
  document.getElementById('promo-content-input').value   = get('promo_content');

  const imgUrl = get('promo_image_url');
  const prevEl = document.getElementById('promo-img-preview');
  if (imgUrl) { prevEl.src = imgUrl; prevEl.style.display = 'block'; }
  else          { prevEl.style.display = 'none'; }
}

document.getElementById('promo-image-upload').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const ext  = file.name.split('.').pop();
  const path = 'promo/promo-' + Date.now() + '.' + ext;

  const { error } = await sb.storage.from('photos').upload(path, file, { upsert: true });
  if (error) { showToast('圖片上傳失敗', 'error'); e.target.value = ''; return; }

  const { data: pubData } = sb.storage.from('photos').getPublicUrl(path);
  await sb.from('settings').upsert({ key: 'promo_image_url', value: pubData.publicUrl }, { onConflict: 'key' });

  const prevEl = document.getElementById('promo-img-preview');
  prevEl.src = pubData.publicUrl;
  prevEl.style.display = 'block';
  e.target.value = '';
  showToast('優惠圖片已上傳');
});

document.getElementById('save-promo-btn').addEventListener('click', async function () {
  const btn = document.getElementById('save-promo-btn');
  btn.disabled = true;
  btn.textContent = '儲存中…';

  const upserts = [
    { key: 'promo_active',  value: document.getElementById('promo-toggle').checked ? 'true' : 'false' },
    { key: 'promo_title',   value: document.getElementById('promo-title-input').value },
    { key: 'promo_content', value: document.getElementById('promo-content-input').value }
  ];

  const { error } = await sb.from('settings').upsert(upserts, { onConflict: 'key' });

  btn.disabled = false;
  btn.textContent = '儲存優惠設定';

  if (error) { showToast('儲存失敗', 'error'); return; }
  showToast('今日優惠已更新！');
});

// ── Toast ────────────────────────────────────────────────

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || 'success');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { toast.classList.remove('show'); }, 3000);
}

// ── Bootstrap ────────────────────────────────────────────

async function init() {
  if (!initSupabase()) return;

  sb.auth.onAuthStateChange(function (event, session) {
    if (session) showAdmin();
    else         showLogin();
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) showAdmin();
  else         showLogin();
}

document.addEventListener('DOMContentLoaded', init);
