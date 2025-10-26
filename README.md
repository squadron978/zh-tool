# Star Citizen 中文化工具（zh-tool）

一鍵安裝或更新繁體中文語系，並提供語系切換與還原功能。由 978 中隊維護；請務必自官方網站下載並驗證來源。

官方網站：<https://squadron978.net>

## 功能特色
- 自動偵測 Star Citizen 安裝路徑（Windows）
- 下載並安裝/更新中文化檔案（目標路徑：`LIVE/data/Localization/chinese_(traditional)/global.ini`）
- 語系檔案管理：
  - 顯示 `LIVE/data/Localization` 下的語系資料夾
  - 一鍵切換 `system.cfg` 的 `sys_languages` 與 `g_language`
  - 一鍵重設為原版語系（移除 `system.cfg`）
- 進階設定：手動指定或重新偵測安裝目錄
- 執行流程日誌與成功提示視窗

## 使用方式
1. 開啟程式，於首頁點選「中文化與語系管理」。
2. 在「自動中文化」分頁：
   - 按「開始自動安裝中文化」或「自動更新最新版中文化」。
   - 觀察下方日誌，完成後會顯示成功提示。
3. 若未偵測到正確路徑，系統會自動切換到「進階設定」，請設定正確的 Star Citizen 安裝目錄。
4. 在「語系檔管理」可：
   - 檢視目前偵測到的語系資料夾
   - 選擇語系並「切換至此語系」
   - 「重設為原版語系」以移除 `system.cfg`

## 系統需求
- Windows 10/11（需 WebView2 Runtime，程式會自動引導安裝）

## 安全與來源
- 本工具僅提供中文化檔案下載與語系設定等輔助功能，不會修改、破解、注入、蒐集或刪除任何使用者資料，也不會對系統進行損害性操作。
- 請務必從官方網站下載；不要相信其他任何來源的執行檔案，以免被駭或資料遭竊。

## 回報與支援
如有問題，請來信：squadron978@gmail.com

## License / 授權
This project is licensed under the **MIT No-Derivatives License (MIT-ND)**.  
© 2025 Squadron 978 — Redistribution of modified versions is not permitted.  
See the [LICENSE](./LICENSE) file for details.

本專案採用 **MIT 無衍生授權（MIT‑ND）**。  
© 2025 Squadron 978 — 禁止重新散佈修改後的版本。  
詳見 [LICENSE](./LICENSE) 檔案。
