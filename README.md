# ZettelAI

## 🚀 專案運行與設定

這是一個使用 React + Vite 搭建的專案，以下為基本操作說明：

### 1. 安裝與啟動

- **安裝依賴套件**：
  ```bash
  npm install
  ```
- **啟動開發伺服器**：
  ```bash
  npm run dev
  ```
- **專案打包**：
  ```bash
  npm run build
  ```

### 2. 部署 (GitHub Actions)
專案內建 `.github/workflows/deploy.yml`。
當程式碼 push 到 `main` 分支時，會自動觸發 GitHub Actions 進行打包，並發布到 GitHub Pages。
> **注意**：請確保在 GitHub 儲存庫的 **Settings > Pages > Build and deployment** 中，將 **Source** 設為 **GitHub Actions**。

### 3. Git 忽略檔案設定
`.gitignore` 已經過設計，自動排除了不需要上傳的檔案與資料夾，包含：
- `node_modules/` (套件檔案)
- `dist/` (打包輸出)
- `.env` 系列檔案 (密鑰與環境變數)
- `.DS_Store`、編輯器暫存檔等。
