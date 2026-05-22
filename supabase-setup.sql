-- ════════════════════════════════════════════════════════════════
-- 多租戶一頁式店家網站平台 — Supabase 初始化腳本
-- ════════════════════════════════════════════════════════════════
-- 執行步驟：
-- 1. Supabase 後台 > SQL Editor > 貼上整段 > Run
-- 2. Storage > New bucket > 名稱 `photos` > Public 開啟
-- 3. 完成後到 Auth > Settings > 確認允許 Email Signup
-- ════════════════════════════════════════════════════════════════

-- ── 0. 清空舊單店模式的資料（如果存在） ──────────────────────
-- 若是全新專案可略過，舊政策無此名稱不會出錯
drop policy if exists "photos_read"   on public.photos;
drop policy if exists "photos_insert" on public.photos;
drop policy if exists "photos_update" on public.photos;
drop policy if exists "photos_delete" on public.photos;
drop policy if exists "settings_read"   on public.settings;
drop policy if exists "settings_insert" on public.settings;
drop policy if exists "settings_update" on public.settings;
drop policy if exists "analytics_insert" on public.analytics_events;
drop policy if exists "analytics_read"   on public.analytics_events;

do $$
begin
  if to_regclass('public.photos')           is not null then execute 'truncate table public.photos           restart identity cascade'; end if;
  if to_regclass('public.settings')         is not null then execute 'truncate table public.settings         restart identity cascade'; end if;
  if to_regclass('public.analytics_events') is not null then execute 'truncate table public.analytics_events restart identity cascade'; end if;
end $$;

-- 如果是全新專案，先確保這三張表存在（單店模板沒跑過時 truncate 會被跳過，這裡建立）
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null default '',
  url          text not null,
  link_url     text default '',
  sort_order   bigint default 0,
  created_at   timestamptz default now()
);
create table if not exists public.settings (
  key        text not null,
  value      text default '',
  updated_at timestamptz default now()
);
create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,
  session_id  text not null,
  event_date  date default current_date,
  created_at  timestamptz default now()
);

-- ── 1. stores：每家店一筆 ────────────────────────────────
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name        text not null default '我的店',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stores_slug_idx on public.stores (slug) where is_active = true;

-- ── 2. profiles：使用者 ↔ 店家對應 ─────────────────────────
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_store_idx on public.profiles (store_id);

-- ── 3. 既有表加 store_id ──────────────────────────────────
alter table public.photos
  add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.photos
  add column if not exists url_mobile text default '',
  add column if not exists media_type text default 'image';

alter table public.settings
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

alter table public.analytics_events
  add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.analytics_events
  add column if not exists visitor_id text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists referrer text,
  add column if not exists device text;

-- settings 改成 (store_id, key) 複合主鍵
alter table public.settings drop constraint if exists settings_pkey;
alter table public.settings add constraint settings_pkey primary key (store_id, key);

-- photos / analytics_events 加索引（依 store_id 查詢效率）
create index if not exists photos_store_idx        on public.photos (store_id, sort_order);
create index if not exists analytics_store_date_idx on public.analytics_events (store_id, event_date);

-- ── 4. 自助註冊 function（atomic 建立 store + profile） ─────
-- SECURITY DEFINER 讓任意 authenticated user 可呼叫，但內部嚴格驗證
create or replace function public.create_store_for_current_user(
  p_slug text,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_store_id uuid;
  v_existing uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 一個 user 只能擁有一家店（這版限制，未來可放寬）
  select store_id into v_existing from public.profiles where user_id = v_user_id;
  if v_existing is not null then
    raise exception 'User already owns a store';
  end if;

  -- slug 格式驗證（regex 防止 SQL injection / 怪字元）
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,30}$' then
    raise exception 'Invalid slug format';
  end if;

  -- 保留字（不可註冊 admin/signup/login/api 等系統路徑）
  if p_slug in ('admin','signup','login','api','assets','css','js','public','www','app','dashboard','static') then
    raise exception 'Slug is reserved';
  end if;

  insert into public.stores (slug, name)
  values (p_slug, coalesce(nullif(trim(p_name), ''), '我的店'))
  returning id into v_store_id;

  insert into public.profiles (user_id, store_id, role)
  values (v_user_id, v_store_id, 'owner');

  -- 預設 settings（每家店建立時都會有這些 key）
  insert into public.settings (store_id, key, value) values
    (v_store_id, 'store_name',           coalesce(nullif(trim(p_name), ''), '我的店')),
    (v_store_id, 'store_tagline',        ''),
    (v_store_id, 'phone_number',         ''),
    (v_store_id, 'reservation_url',      ''),
    (v_store_id, 'facebook_pixel_id',    ''),
    (v_store_id, 'address_text',         ''),
    (v_store_id, 'google_maps_embed_url',''),
    (v_store_id, 'meta_description',     ''),
    (v_store_id, 'cuisine_type',         ''),
    (v_store_id, 'price_range',          ''),
    (v_store_id, 'opening_hours_text',   ''),
    (v_store_id, 'seo_keywords',         ''),
    (v_store_id, 'og_share_title',       ''),
    (v_store_id, 'og_share_description', ''),
    (v_store_id, 'og_share_image_url',   ''),
    (v_store_id, 'promo_active',         'false'),
    (v_store_id, 'promo_title',          ''),
    (v_store_id, 'promo_content',        ''),
    (v_store_id, 'promo_image_url',      '');

  return v_store_id;
end;
$$;

grant execute on function public.create_store_for_current_user(text, text) to authenticated;

-- ── 5. helper：取得目前 user 的 store_id ──────────────────────
create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.profiles where user_id = auth.uid()
$$;

grant execute on function public.current_store_id() to authenticated;

-- ── 6. 啟用 Row Level Security ───────────────────────────────
alter table public.stores            enable row level security;
alter table public.profiles          enable row level security;
alter table public.photos            enable row level security;
alter table public.settings          enable row level security;
alter table public.analytics_events  enable row level security;

-- ── 7. RLS Policies ─────────────────────────────────────────

-- stores：前台讀 is_active 的店；owner 可改自己的；禁止直接 insert/delete（用 function）
create policy "stores_public_read" on public.stores
  for select to anon, authenticated
  using (is_active = true);

create policy "stores_owner_update" on public.stores
  for update to authenticated
  using (id = public.current_store_id())
  with check (id = public.current_store_id());

-- profiles：使用者只能讀自己的
create policy "profiles_self_read" on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

-- photos：前台讀對應 store；後台只能改自己的
create policy "photos_public_read" on public.photos
  for select to anon, authenticated
  using (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = photos.store_id and s.is_active = true)
  );

create policy "photos_owner_insert" on public.photos
  for insert to authenticated
  with check (store_id = public.current_store_id());

create policy "photos_owner_update" on public.photos
  for update to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());

create policy "photos_owner_delete" on public.photos
  for delete to authenticated
  using (store_id = public.current_store_id());

-- settings：前台讀對應 store；後台只能改自己的
create policy "settings_public_read" on public.settings
  for select to anon, authenticated
  using (
    exists (select 1 from public.stores s where s.id = settings.store_id and s.is_active = true)
  );

create policy "settings_owner_insert" on public.settings
  for insert to authenticated
  with check (store_id = public.current_store_id());

create policy "settings_owner_update" on public.settings
  for update to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());

-- analytics_events：前台 anon 可寫（但有長度限制），owner 可讀自己的
create policy "analytics_anon_insert" on public.analytics_events
  for insert to anon, authenticated
  with check (
    store_id is not null
    and length(coalesce(event_type, ''))   <= 64
    and length(coalesce(session_id, ''))   <= 128
    and length(coalesce(visitor_id, ''))   <= 128
    and length(coalesce(utm_source, ''))   <= 64
    and length(coalesce(utm_medium, ''))   <= 64
    and length(coalesce(utm_campaign, '')) <= 128
    and length(coalesce(utm_content, ''))  <= 128
    and length(coalesce(referrer, ''))     <= 512
    and length(coalesce(device, ''))       <= 32
  );

create policy "analytics_owner_read" on public.analytics_events
  for select to authenticated
  using (store_id = public.current_store_id());

-- ── 8. Storage bucket policies ───────────────────────────────
-- bucket: photos（請先在 Storage 後台建好，Public 開啟）
-- 路徑強制：${store_id}/xxx.webp
-- 所有 owner 只能寫自己 store_id 開頭的路徑
do $$
begin
  -- 清掉舊政策（避免衝突）
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_public_read') then
    drop policy "photos_public_read" on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_insert') then
    drop policy "photos_owner_insert" on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_update') then
    drop policy "photos_owner_update" on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_delete') then
    drop policy "photos_owner_delete" on storage.objects;
  end if;
end $$;

create policy "photos_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos');

create policy "photos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );

create policy "photos_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );

create policy "photos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );

-- ════════════════════════════════════════════════════════════════
-- 完成！後續步驟：
-- 1. Storage > New bucket > 名稱 `photos` > Public bucket 開啟
-- 2. Auth > Settings > Enable Email Signup（自助註冊用）
-- 3. 部署到 Vercel 並設定環境變數 SUPABASE_URL / SUPABASE_ANON_KEY
-- ════════════════════════════════════════════════════════════════
