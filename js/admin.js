'use strict';

const { createClient } = window.supabase;
let sb = null;

// ── YouTube helper ────────────────────────────────────────

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

var _analyticsCache = null;

async function loadAnalytics() {
  var container = document.getElementById('analytics-content');
  container.innerHTML = '<div class="loading">載入數據中</div>';
  var today = new Date().toISOString().slice(0, 10);

  var resetAt = null;
  var resetResult = await sb.from('settings').select('value').eq('key', 'analytics_reset_at').maybeSingle();
  var resetRow = resetResult.data;
  if (resetRow && resetRow.value && resetRow.value.slice(0, 10) === today) resetAt = resetRow.value;

  var evQuery = sb.from('analytics_events').select('event_type, session_id').eq('event_date', today);
  if (resetAt) evQuery = evQuery.gte('created_at', resetAt);
  var evResult = await evQuery;

  if (evResult.error || !evResult.data) {
    container.innerHTML = '<p style="color:#e05252;text-align:center;padding:20px;">載入失敗，請重試</p>';
    return;
  }

  var sessions = {};
  evResult.data.forEach(function(ev) {
    if (!sessions[ev.session_id]) sessions[ev.session_id] = {};
    sessions[ev.session_id][ev.event_type] = true;
  });
  var sessionArr = Object.values(sessions);

  function computeGroup(arr) {
    var v = arr.filter(function(s) { return s['page_view']; }).length;
    function cnt(t) { return arr.filter(function(s) { return s[t]; }).length; }
    function pct(n) { return v > 0 ? Math.round(n / v * 100) + '%' : '—'; }
    var s33 = cnt('scroll_33'), s67 = cnt('scroll_67'), s100 = cnt('scroll_100');
    var res = cnt('reservation_click'), call = cnt('call_click');
    var cta = arr.filter(function(s) { return s['reservation_click'] || s['call_click']; }).length;
    return {
      visitors: v,
      rows: [
        { label: '進站人數',   value: v + ' 人' },
        { label: '首圖留存率', value: pct(cnt('hero_passed')) },
        { label: '1/3 跳出率', value: v > 0 ? Math.round(Math.max(0, s33 - s67)  / v * 100) + '%' : '—' },
        { label: '2/3 跳出率', value: v > 0 ? Math.round(Math.max(0, s67 - s100) / v * 100) + '%' : '—' },
        { label: '看完率',     value: pct(s100) },
        { label: 'CTA 點擊率', value: pct(cta) },
        { label: '訂位轉換率', value: pct(res) },
        { label: '電話轉換率', value: pct(call) }
      ]
    };
  }

  function cntAll(t) { return sessionArr.filter(function(s) { return s[t]; }).length; }
  var sources = [
    { label: 'Facebook',  value: cntAll('source_facebook')  + ' 人' },
    { label: 'Instagram', value: cntAll('source_instagram') + ' 人' },
    { label: 'Threads',   value: cntAll('source_threads')   + ' 人' },
    { label: 'Google',    value: cntAll('source_google')    + ' 人' },
    { label: 'LINE',      value: cntAll('source_line')      + ' 人' }
  ];

  _analyticsCache = {
    today: today,
    newGroup:    computeGroup(sessionArr.filter(function(s) { return s['new_visitor']; })),
    returnGroup: computeGroup(sessionArr.filter(function(s) { return s['returning_visitor']; })),
    sources: sources
  };

  container.innerHTML =
    '<div class="tab-title">今日數據 <span class="badge">' + today + '</span></div>' +
    '<div class="visitor-toggle">' +
    '<button id="vtog-new" class="vtog active" onclick="switchVisitorMode(\'new\')">第一次進站<span class="vtog-count">' + _analyticsCache.newGroup.visitors + ' 人</span></button>' +
    '<button id="vtog-ret" class="vtog" onclick="switchVisitorMode(\'return\')">重複進站<span class="vtog-count">' + _analyticsCache.returnGroup.visitors + ' 人</span></button>' +
    '</div>' +
    '<div id="analytics-mode-grid" class="stat-grid"></div>' +
    '<div class="tab-title" style="margin-top:24px;font-size:0.9rem;">流量來源</div>' +
    '<div class="stat-grid">' +
    sources.map(function(s) {
      return '<div class="stat-card"><span class="stat-value">' + s.value + '</span><span class="stat-label">' + s.label + '</span></div>';
    }).join('') +
    '</div>' +
    '<p class="analytics-note">數據反映今日截至目前的訪客行為，每次開啟自動更新</p>' +
    '<div style="text-align:center;margin-top:20px;"><button onclick="resetAnalytics()" class="btn-reset-analytics">數據重置</button></div>';

  renderAnalyticsMode('new');
}

function renderAnalyticsMode(mode) {
  if (!_analyticsCache) return;
  var group = mode === 'new' ? _analyticsCache.newGroup : _analyticsCache.returnGroup;
  var grid = document.getElementById('analytics-mode-grid');
  if (grid) {
    grid.innerHTML = group.rows.map(function(r) {
      return '<div class="stat-card"><span class="stat-value">' + r.value + '</span><span class="stat-label">' + r.label + '</span></div>';
    }).join('');
  }
  var btnNew = document.getElementById('vtog-new');
  var btnRet = document.getElementById('vtog-ret');
  if (btnNew) btnNew.classList.toggle('active', mode === 'new');
  if (btnRet) btnRet.classList.toggle('active', mode === 'return');
}

function switchVisitorMode(mode) { renderAnalyticsMode(mode); }

async function resetAnalytics() {
  if (!confirm('確定要清除今日所有數據並重新計算嗎？此操作無法復原。')) return;
  var resetTime = new Date().toISOString();
  var { error } = await sb.from('settings').upsert({ key: 'analytics_reset_at', value: resetTime });
  if (error) { showToast('重置失敗：' + error.message, 'error'); return; }
  showToast('今日數據已清除，重新計算中…');
  loadAnalytics();
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
    list.innerHTML = '<p class="empty-msg">尚未上傳任何照片或影片，點擊上方新增</p>';
    return;
  }

  list.innerHTML = allPhotos.map(function (item, i) {
    const isYT = item.media_type === 'youtube';
    const ytId = isYT ? getYouTubeId(item.url) : null;

    // 縮圖：YouTube 用官方縮圖，圖片用本身 URL
    const thumbHtml = isYT && ytId
      ? [
          '<div class="photo-thumb" style="background:#000;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">',
          '  <img src="https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.85;">',
          '  <svg style="position:absolute;pointer-events:none;" width="28" height="28" viewBox="0 0 24 24" fill="#ff0000"><path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.2 5 12 5 12 5s-4.2 0-7 .1c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.7 2.2.8C6.8 19 12 19 12 19s4.2 0 7-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8z"/><polygon fill="#fff" points="10,15 15,12 10,9"/></svg>',
          '</div>'
        ].join('')
      : '<img src="' + item.url + '" alt="照片" class="photo-thumb">';

    // 影片只顯示網址（唯讀），圖片顯示可編輯的連結輸入框
    const inputHtml = isYT
      ? '<p style="font-size:0.78rem;color:#8b7355;word-break:break-all;margin:0;">' + item.url + '</p>'
      : '<input type="url" class="photo-link-input" data-id="' + item.id + '" value="' + (item.link_url || '') + '" placeholder="點擊後開啟的連結網址（選填）">';

    const linkBtnHtml = isYT
      ? ''
      : '<button class="btn-sm primary" onclick="savePhotoLink(\'' + item.id + '\')">儲存連結</button>';

    return [
      '<div class="photo-item" data-id="' + item.id + '">',
      thumbHtml,
      '  <div class="photo-info">',
      inputHtml,
      '    <div class="photo-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">',
      (i > 0 ? '<button class="btn-sm" onclick="movePhoto(\'' + item.id + '\',\'up\')">↑ 上移</button>' : ''),
      (i < allPhotos.length - 1 ? '<button class="btn-sm" onclick="movePhoto(\'' + item.id + '\',\'down\')">↓ 下移</button>' : ''),
      '<div style="display:flex;align-items:center;gap:3px;">',
      '<span style="font-size:0.78rem;color:#8b7355;white-space:nowrap;">移到第</span>',
      '<input type="number" id="pos-' + item.id + '" min="1" max="' + allPhotos.length + '" value="' + (i + 1) + '" style="width:42px;padding:3px 4px;border:1px solid #e8d5c4;border-radius:6px;font-size:0.82rem;text-align:center;">',
      '<span style="font-size:0.78rem;color:#8b7355;">張</span>',
      '<button class="btn-sm" onclick="movePhotoTo(\'' + item.id + '\')">移</button>',
      '</div>',
      linkBtnHtml,
      '<button class="btn-sm danger" onclick="deletePhoto(\'' + item.id + '\',\'' + (item.storage_path || '') + '\',\'' + item.media_type + '\')">刪除</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
  }).join('');
}

function processImage(file) {
  return new Promise(function (resolve) {
    if (!file.type.startsWith('image/')) {
      resolve({ desktop: file, mobile: file, originalSize: file.size, compressedSize: file.size });
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        function makeBlob(maxPx, quality, cb) {
          var ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(cb, 'image/webp', quality);
        }
        makeBlob(1920, 0.80, function (desktopBlob) {
          makeBlob(900, 0.75, function (mobileBlob) {
            resolve({
              desktop:        new File([desktopBlob], 'photo.webp',   { type: 'image/webp' }),
              mobile:         new File([mobileBlob],  'photo_m.webp', { type: 'image/webp' }),
              originalSize:   file.size,
              compressedSize: desktopBlob.size
            });
          });
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('photo-upload').addEventListener('change', async function (e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const MB10 = 10 * 1024 * 1024;
  const bigCount = files.filter(function (f) { return f.size > MB10; }).length;
  if (bigCount) showToast(bigCount + ' 張圖片超過 10MB，將自動壓縮', 'warn');

  const labelEl = document.getElementById('upload-label-text');

  for (var i = 0; i < files.length; i++) {
    labelEl.textContent = '處理中 ' + (i + 1) + '/' + files.length + '…';
    const { desktop, mobile, originalSize, compressedSize } = await processImage(files[i]);

    const saving = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0;
    const sizeKB  = Math.round(compressedSize / 1024);

    labelEl.textContent = '上傳中 ' + (i + 1) + '/' + files.length + '…';
    const base        = Date.now() + '-' + Math.random().toString(36).slice(2);
    const pathDesktop = base + '.webp';
    const pathMobile  = base + '_m.webp';

    const { error: e1 } = await sb.storage.from('photos').upload(pathDesktop, desktop);
    if (e1) { showToast('上傳失敗：' + e1.message, 'error'); continue; }

    await sb.storage.from('photos').upload(pathMobile, mobile);

    const { data: pub1 } = sb.storage.from('photos').getPublicUrl(pathDesktop);
    const { data: pub2 } = sb.storage.from('photos').getPublicUrl(pathMobile);

    await sb.from('photos').insert({
      storage_path: pathDesktop,
      url:          pub1.publicUrl,
      url_mobile:   pub2 ? pub2.publicUrl : '',
      link_url:     '',
      sort_order:   Date.now()
    });

    showToast('WebP 轉換完成，節省 ' + saving + '%（' + sizeKB + ' KB）');
  }

  labelEl.textContent = '+ 上傳照片';
  e.target.value = '';
  loadPhotos();
});

async function savePhotoLink(id) {
  const input = document.querySelector('.photo-link-input[data-id="' + id + '"]');
  const { error } = await sb.from('photos').update({ link_url: input.value }).eq('id', id);
  if (error) { showToast('儲存失敗', 'error'); return; }
  showToast('連結已儲存');
}

// ── YouTube Modal ─────────────────────────────────────────

function openYtModal() {
  var modal = document.getElementById('yt-modal');
  var input = document.getElementById('yt-modal-input');
  var preview = document.getElementById('yt-modal-preview');
  input.value = '';
  preview.innerHTML = '';
  preview.classList.add('hidden');
  modal.classList.remove('hidden');
  setTimeout(function () { input.focus(); }, 300);
}

function closeYtModal() {
  document.getElementById('yt-modal').classList.add('hidden');
}

document.getElementById('open-yt-modal-btn').addEventListener('click', openYtModal);
document.getElementById('yt-modal-cancel').addEventListener('click', closeYtModal);

// 點遮罩關閉
document.getElementById('yt-modal').addEventListener('click', function (e) {
  if (e.target === this) closeYtModal();
});

// 貼上網址即時預覽影片
document.getElementById('yt-modal-input').addEventListener('input', function () {
  var vid = getYouTubeId(this.value.trim());
  var preview = document.getElementById('yt-modal-preview');
  if (vid) {
    preview.innerHTML = '<iframe src="https://www.youtube.com/embed/' + vid + '?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
    preview.classList.remove('hidden');
  } else {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
});

// 確認新增
document.getElementById('yt-modal-confirm').addEventListener('click', async function () {
  var url = document.getElementById('yt-modal-input').value.trim();
  if (!url) { showToast('請先貼上 YouTube 網址', 'error'); return; }

  var videoId = getYouTubeId(url);
  if (!videoId) { showToast('無法辨識此 YouTube 網址', 'error'); return; }

  var btn = this;
  btn.disabled = true;
  btn.textContent = '新增中…';

  var { error } = await sb.from('photos').insert({
    storage_path: '',
    url:          url,
    link_url:     '',
    sort_order:   Date.now(),
    media_type:   'youtube'
  });

  btn.disabled = false;
  btn.textContent = '加入影片';

  if (error) { showToast('新增失敗：' + error.message, 'error'); return; }

  closeYtModal();
  showToast('YouTube 影片已加入！');
  loadPhotos();
});

async function deletePhoto(id, storagePath, mediaType) {
  const label = mediaType === 'youtube' ? '這部影片' : '這張照片';
  if (!confirm('確定要刪除' + label + '嗎？')) return;
  if (mediaType !== 'youtube' && storagePath) {
    const paths = [storagePath];
    if (storagePath.endsWith('.webp')) paths.push(storagePath.replace('.webp', '_m.webp'));
    await sb.storage.from('photos').remove(paths);
  }
  await sb.from('photos').delete().eq('id', id);
  showToast('已刪除');
  loadPhotos();
}

async function movePhoto(id, dir) {
  const idx = allPhotos.findIndex(function (p) { return p.id === id; });
  if (idx === -1) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= allPhotos.length) return;

  const a = allPhotos[idx];
  const b = allPhotos[targetIdx];
  const orderA = a.sort_order;
  const orderB = b.sort_order;

  // Instant visual swap — no waiting for DB
  allPhotos[idx] = b;
  allPhotos[targetIdx] = a;
  renderPhotos();

  // Sync to DB in background
  a.sort_order = orderB;
  b.sort_order = orderA;
  await Promise.all([
    sb.from('photos').update({ sort_order: orderB }).eq('id', a.id),
    sb.from('photos').update({ sort_order: orderA }).eq('id', b.id)
  ]);
}

async function movePhotoTo(id) {
  const input = document.getElementById('pos-' + id);
  if (!input) return;
  const newPos = parseInt(input.value, 10);
  const idx = allPhotos.findIndex(function (p) { return p.id === id; });
  if (idx === -1) return;
  if (isNaN(newPos) || newPos < 1 || newPos > allPhotos.length || newPos === idx + 1) return;

  const targetIdx = newPos - 1;
  const item = allPhotos.splice(idx, 1)[0];
  allPhotos.splice(targetIdx, 0, item);
  renderPhotos();

  // Reassign sort_orders for all items to keep order stable
  const base = Date.now();
  await Promise.all(allPhotos.map(function (p, i) {
    p.sort_order = base + i;
    return sb.from('photos').update({ sort_order: base + i }).eq('id', p.id);
  }));
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
  document.getElementById('s-meta-desc').value     = get('meta_description');
  document.getElementById('s-cuisine').value       = get('cuisine_type');
  document.getElementById('s-price').value         = get('price_range');
  document.getElementById('s-hours').value         = get('opening_hours_text');
  document.getElementById('s-keywords').value      = get('seo_keywords');

  document.getElementById('s-og-title').value = get('og_share_title');
  document.getElementById('s-og-desc').value  = get('og_share_description');
  const ogImg = get('og_share_image_url');
  const ogPrev = document.getElementById('s-og-img-preview');
  if (ogImg) { ogPrev.src = ogImg; ogPrev.style.display = 'block'; }
  else ogPrev.style.display = 'none';
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
    ['google_maps_embed_url',document.getElementById('s-maps').value],
    ['meta_description',     document.getElementById('s-meta-desc').value],
    ['cuisine_type',         document.getElementById('s-cuisine').value],
    ['price_range',          document.getElementById('s-price').value],
    ['opening_hours_text',   document.getElementById('s-hours').value],
    ['seo_keywords',         document.getElementById('s-keywords').value],
    ['og_share_title',       document.getElementById('s-og-title').value],
    ['og_share_description', document.getElementById('s-og-desc').value]
  ];

  const upserts = pairs.map(function (p) { return { key: p[0], value: p[1] }; });
  const { error } = await sb.from('settings').upsert(upserts, { onConflict: 'key' });

  btn.disabled = false;
  btn.textContent = '儲存設定';

  if (error) { showToast('儲存失敗：' + error.message, 'error'); return; }
  showToast('設定已儲存！');
});

// ── OG Share Image ───────────────────────────────────────

document.getElementById('s-og-image-upload').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  showToast('處理中…');

  // 強制轉 JPEG，確保 LINE / FB 可正確顯示
  const { blob, width, height } = await new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var MAX = 2000;
        var ratio = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (b) {
          resolve({ blob: b, width: canvas.width, height: canvas.height });
        }, 'image/jpeg', 0.90);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const uploadPath = 'og/share-' + Date.now() + '.jpg';
  const { error } = await sb.storage.from('photos').upload(
    uploadPath, new File([blob], 'share.jpg', { type: 'image/jpeg' }), { upsert: true }
  );
  if (error) { showToast('圖片上傳失敗', 'error'); e.target.value = ''; return; }

  const { data: pub } = sb.storage.from('photos').getPublicUrl(uploadPath);
  await sb.from('settings').upsert([
    { key: 'og_share_image_url',    value: pub.publicUrl },
    { key: 'og_share_image_width',  value: String(width) },
    { key: 'og_share_image_height', value: String(height) }
  ], { onConflict: 'key' });

  const prev = document.getElementById('s-og-img-preview');
  prev.src = pub.publicUrl;
  prev.style.display = 'block';
  e.target.value = '';
  showToast('分享主圖已上傳！');
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
