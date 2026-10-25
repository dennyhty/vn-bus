# vn-bus

越南長途巴士查詢網站。資料來自 Vexere 公開路線頁，介面是中文，站名、車行、車型保留英文，方便在 Vexere app 對照訂票。

- `site/`：前端網頁，部署到 GitHub Pages
- `worker/`：Cloudflare Worker，代網頁向 Vexere 抓公開路線頁並整理成 JSON（瀏覽器不能直接跨站抓）
- `scripts/build-routes.mjs`：從 Vexere sitemap 產生 `site/routes.json`（路線清單）

範例畫面：打開網站後在網址加上 `?demo=1`，會用內建的範例資料顯示。

## 限制

- 只用公開、不帶日期的路線頁（Vexere 的 robots.txt 不允許抓帶 `?date=` 的頁面），所以只能看 Vexere 預設的日期。
- 每條路線只有前 20 班。
- 地圖上的上下車點是整條路線所有車行合計的地點，不是每班車各自的停靠點。
- Worker 會快取 5 分鐘，避免頻繁打擾 Vexere。請保持個人、低頻率使用。

## 設定步驟

### 1. 部署 Worker

需要一個免費的 Cloudflare 帳號。

```sh
cd worker
npm install
npx wrangler login     # 會開瀏覽器登入 Cloudflare
npx wrangler deploy    # 完成後會顯示 https://vn-bus.<你的子網域>.workers.dev
```

把顯示的網址填到 `site/config.js` 的 `workerUrl`。

### 2. 產生路線清單

```sh
node scripts/build-routes.mjs
```

會覆寫 `site/routes.json`。預設只有「Saigon → Da Lat」一條。

### 3. 開啟 GitHub Pages

到 repo 的 Settings → Pages，Source 選 **GitHub Actions**。之後推到 `main` 的 `site/` 變更會自動部署到 https://dennyhty.github.io/vn-bus/ 。

## 本機測試

```sh
cd site && python3 -m http.server 8000   # 打開 http://localhost:8000/?demo=1
cd worker && npm test                    # 解析程式的測試
cd worker && npx wrangler dev            # 本機跑 Worker
```
