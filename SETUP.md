# 多租戶一頁式店家網站平台 — 部署教學

一套程式，多家店共用。每家店資料獨立，可部署在 Vercel 免費版。

---

## 架構說明

| 路由 | 檔案 | 說明 |
|---|---|---|
| `/` | `platform.html` | 平台首頁（含註冊／登入入口） |
| `/signup` | `signup.html` | 自助註冊，建立店家 + 帳號 |
| `/login` | `login.html` | 店家後台登入 |
| `/admin` | `admin.html` | 多租戶後台（依登入帳號顯示自己的店） |
| `/{slug}` | `api/index.js` → `store.html` | 店家一頁式網站（SSR 注入 OG meta） |

**Stack**：純靜態 HTML/JS + Supabase（Auth + DB + Storage）+ Vercel Serverless Functions。**無框架、無 build step、無 node_modules**。

---

## 步驟一：建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 免費註冊 → **New Project**
2. 設定資料庫密碼，等約 1 分鐘
3. 左側 **SQL Editor** → 把 `supabase-setup.sql` **整段貼上 → Run**（會建 stores / profiles / photos / settings / analytics_events + RLS + 自助註冊 function）

---

## 步驟二：Storage Bucket

1. 左側 **Storage** → **New bucket**
2. 名稱填 `photos`，**Public bucket 開啟** → Save
3. （Bucket policy 已由步驟一的 SQL 自動建立，**不需手動加 policy**）

---

## 步驟三：Auth 設定

1. 左側 **Authentication** → **Settings**
2. 確認 **Enable Email Signup** 為開啟
3. （可選）**Confirm email** 若關閉，使用者註冊後直接登入；若開啟，要點驗證信才能登入

---

## 步驟四：取得連線資訊

1. 左側 **Settings → API**
2. 複製：
   - `Project URL` → 之後設定到 `SUPABASE_URL`
   - `anon public` key → 之後設定到 `SUPABASE_ANON_KEY`

---

## 步驟五：部署到 Vercel

### 推薦：GitHub + Vercel

1. `git push` 此專案到你的 GitHub
2. [vercel.com](https://vercel.com) → **Add New → Project** → 連 repo
3. **Environment Variables** 加兩個：
   ```
   SUPABASE_URL        = https://xxxx.supabase.co
   SUPABASE_ANON_KEY   = eyJhbGci...
   ```
4. **Deploy**（不需設定 build command，純靜態 + serverless）

### 本地測試

```bash
npm i -g vercel
vercel link            # 連到你的 Vercel 專案（拉環境變數）
vercel env pull        # 把 env 拉到 .env.local
vercel dev             # 啟動本地伺服器（含 serverless functions）
```

> 為什麼不能用 `python -m http.server` 之類的靜態伺服器？  
> 因為 `/api/config.js` 與 `/{slug}` 都需要 Vercel serverless 來執行，純靜態伺服器跑不起來。

---

## 步驟六：建立第一家店

直接打開 `https://你的網域/signup` → 填店名 + slug + email + 密碼 → 完成。

或要在 Supabase 後台手動測試：
1. **Authentication → Users** → Add user（填 email + password + Auto Confirm 開啟）
2. **SQL Editor** → 跑：
   ```sql
   -- 用該 user 的身份呼叫 function
   -- 1. 從 Authentication 複製 user UUID
   -- 2. 在 SQL editor 不能直接呼叫，需要先 sign in 該 user
   -- 最簡單做法：直接在 /signup 頁註冊
   ```

---

## 後台使用說明

`/admin`

### 📊 數據
- **全部 / 第一次 / 重複** 訪客切換
- 8 項指標：進站、首圖留存、1/3 跳出、2/3 跳出、看完率、CTA、訂位、電話
- 流量來源（FB / IG / Threads / Google / LINE）
- 「數據重置」清除今日累計，重新計算

### 🖼 照片
- 上傳自動轉 WebP（desktop 1920px + mobile 900px，品質 80%/75%）
- 連結網址、排序、換照片、刪除
- YouTube 影片可貼網址加入（含 Shorts / youtu.be）

### ⚙️ 設定
- 店名、副標、電話、訂位網址、FB Pixel、地址、Google Map
- SEO 描述、料理類型、價位、營業時間、關鍵字
- LINE / FB 分享圖（OG image）

### 🎁 優惠
- 啟用開關 + 標題 + 內文 + 圖片 = 訪客進站立刻彈出

---

## 安全機制

- **RLS（Row Level Security）**：每張表都依 `store_id` 隔離；A 店絕對讀不到 B 店資料
- **Storage 路徑強制 `${store_id}/...`**：bucket policy 檢查路徑開頭，無法跨店上傳
- **保留字白名單**：`admin / signup / login / api / www` 等系統路徑不可註冊成 slug
- **analytics 長度限制**：所有 anon 寫入欄位都有長度檢查（RLS check constraint），防被灌爆
- **環境變數**：URL / KEY 不在 git，由 Vercel env vars 注入
- **`anon_key` 不是 secret**：公開無妨，真正的安全靠 RLS。`service_role_key` 絕對不要放任何前端或 git
- **XSS 防護**：店家設定文字以 `textContent` 寫入 DOM；只有 Google Maps iframe `src` 是直接信任的（建議後台加上來源驗證 → 已用 DOM API 而非 innerHTML 插入）

---

## 新增一家新店（流程）

任何訪客造訪 `/signup` → 填表 → 即刻擁有：
- 一個專屬網址 `/{slug}`
- 一個後台帳號（email + 密碼）
- 19 筆預設 settings（全空，等他到後台填）

平台管理者**不需要做任何事**。

---

## 環境變數清單

| 名稱 | 必填 | 用途 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase 專案 URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon 公開 key（前端用） |

兩者都設定到 **Vercel → Project Settings → Environment Variables**（Production + Preview + Development 都要勾）。

---

## 常見問題

**Q：註冊失敗 "User already owns a store"？**  
→ 一個 user 只能擁有一家店。要新店請用新 email 註冊。

**Q：註冊失敗 "Slug is reserved"？**  
→ 撞到系統保留字（admin/signup/login/api/...）。請改別的 slug。

**Q：照片上傳 403？**  
→ Storage bucket `photos` 沒建好，或 bucket 沒設為 Public。

**Q：後台讀不到資料？**  
→ 開瀏覽器 Console 看錯誤。常見：profile 沒寫入（註冊流程出問題 → 重註冊一次）。

**Q：可以一個 user 管多家店嗎？**  
→ 目前版本不行。要做的話：把 `profiles` 改成 (user_id, store_id) 複合主鍵 + UI 加切店下拉。
