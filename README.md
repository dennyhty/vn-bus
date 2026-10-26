# vn-bus

越南長途巴士查詢網站。資料來自 Vexere 公開路線頁，介面是中文，站名、車行、車型保留英文，方便在 Vexere app 對照訂票。

- `site/`：前端網頁，部署到 GitHub Pages
- `worker/`：Cloudflare Worker，代網頁向 Vexere 抓公開路線頁並整理成 JSON（瀏覽器不能直接跨站抓）
- `scripts/build-routes.mjs`：從 Vexere 的 sitemap 產生 `site/routes/`（約 55,000 條路線，依出發地拆成小檔案）

範例畫面：打開網站後在網址加上 `?demo=1`，會用內建的範例資料顯示。

## 能做什麼、不能做什麼

Vexere 的即時班次只在「帶日期」的頁面和需要授權的 API 裡。帶日期的頁面被 Vexere 的 robots.txt 禁止程式抓取，所以這個網站只用不帶日期的公開路線頁：

- 有：每家車行的每日發車時間、票價範圍、評分、上下車點（只有越南文地址）、一個範例班次。
- 沒有：當天的剩餘座位和即時票價。網站提供「到 Vexere 看即時班次」按鈕，帶日期直接開 Vexere 頁面。
- 地圖：上下車點沒有座標，是在瀏覽器用 OpenStreetMap Nominatim 把地址換成位置（結果存在瀏覽器裡），可能有誤差，會標示「約略」。
- 站名、車行同時顯示英文（對照 Vexere app）和越南文原名。
- Worker 會快取 5 分鐘。請保持個人、低頻率使用。

## 單一班次的上下車點（iPhone 捷徑）

Vexere 訂票頁（可以選座位的那頁）的資料裡有這班車所有上下車點、時間、座標與加價。`site/tools/trip-shortcut.js` 是一段 iOS 捷徑「在網頁上執行 JavaScript」用的程式：在訂票頁按「分享」執行，它只讀這一頁已載入的資料，放進網址的 `#` 後面打開 `trip.html`，不經過任何伺服器。設定步驟在 `tools/shortcut.html`。

## 設定步驟

### 1. 部署 Worker

需要一個免費的 Cloudflare 帳號。

```sh
cd worker
npm install
npx wrangler login     # 會開瀏覽器登入 Cloudflare
npx wrangler deploy    # 完成後會顯示 https://vn-bus.<你的子網域>.workers.dev
```

網址填在 `site/config.js` 的 `workerUrl`（目前是 https://vn-bus.vn-bus-worker.workers.dev）。

### 2. 更新路線清單（可選）

```sh
node scripts/build-routes.mjs
```

會重建 `site/routes/`。目前 repo 裡已經有一份。

### 3. 開啟 GitHub Pages

到 repo 的 Settings → Pages，Source 選 **GitHub Actions**。之後推到 `main` 的 `site/` 變更會自動部署到 https://dennyhty.github.io/vn-bus/ 。

## 本機測試

```sh
cd site && python3 -m http.server 8000   # 打開 http://localhost:8000/?demo=1
cd worker && npm test                    # 解析程式的測試
cd worker && npx wrangler dev            # 本機跑 Worker
```
