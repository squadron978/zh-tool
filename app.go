package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// DetectStarCitizenPath 自動偵測 Star Citizen 安裝路徑
func (a *App) DetectStarCitizenPath() string {
	var possiblePaths []string

	if runtime.GOOS == "windows" {
		// Windows 常見安裝路徑
		possiblePaths = []string{
			filepath.Join(os.Getenv("ProgramFiles"), "Roberts Space Industries", "StarCitizen"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Roberts Space Industries", "StarCitizen"),
			filepath.Join("C:", "Program Files", "Roberts Space Industries", "StarCitizen"),
			filepath.Join("D:", "Games", "StarCitizen"),
			filepath.Join("E:", "Games", "StarCitizen"),
		}
	} else if runtime.GOOS == "linux" {
		// Linux 常見路徑
		homeDir, _ := os.UserHomeDir()
		possiblePaths = []string{
			filepath.Join(homeDir, ".wine", "drive_c", "Program Files", "Roberts Space Industries", "StarCitizen"),
			filepath.Join(homeDir, "Games", "StarCitizen"),
		}
	}

	// 檢查路徑是否存在
	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	return ""
}

// SelectDirectory 開啟目錄選擇對話框
func (a *App) SelectDirectory() (string, error) {
	options := wailsRuntime.OpenDialogOptions{
		Title: "選擇 Star Citizen 安裝目錄",
	}

	path, err := wailsRuntime.OpenDirectoryDialog(a.ctx, options)
	if err != nil {
		return "", err
	}

	return path, nil
}

// ValidateStarCitizenPath 驗證選擇的路徑是否為有效的 Star Citizen 目錄
func (a *App) ValidateStarCitizenPath(path string) bool {
	if path == "" {
		return false
	}

	// 支援三種版本資料夾：LIVE / PTU / EPTU
	candidates := []string{
		path,
		filepath.Join(path, "LIVE"),
		filepath.Join(path, "PTU"),
		filepath.Join(path, "EPTU"),
	}

	hasIndicators := func(base string) bool {
		indicators := []string{
			filepath.Join(base, "Bin64"),
			filepath.Join(base, "Data"),
			filepath.Join(base, "Data", "data.p4k"),
			filepath.Join(base, "data.p4k"),
		}
		for _, p := range indicators {
			if _, err := os.Stat(p); err == nil {
				return true
			}
		}
		return false
	}

	for _, c := range candidates {
		if hasIndicators(c) {
			return true
		}
	}
	return false
}

// GetLocalizationPath 獲取中文化檔案應該放置的路徑
func (a *App) GetLocalizationPath(scPath string) string {
	if scPath == "" {
		return ""
	}

	// 優先回傳存在的版本資料夾 (LIVE / PTU / EPTU)，找不到則預設 LIVE
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	for _, vf := range versionFolders {
		base := filepath.Join(scPath, vf)
		if _, err := os.Stat(base); err == nil {
			// 路徑更新：使用 data/Localization
			return filepath.Join(base, "data", "Localization")
		}
	}
	// fallback: 使用 LIVE/data/Localization
	return filepath.Join(scPath, "LIVE", "data", "Localization")
}

// ListInstalledLocalizations 列出目前可能已安裝的語系資料夾名稱（去重）
func (a *App) ListInstalledLocalizations(scPath string) []string {
	if scPath == "" {
		return []string{}
	}
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	seen := map[string]struct{}{}
	var result []string
	for _, vf := range versionFolders {
		locDir := filepath.Join(scPath, vf, "data", "Localization")
		entries, err := os.ReadDir(locDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			// 過濾隱藏或非語系資料夾
			if strings.HasPrefix(name, ".") {
				continue
			}
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			result = append(result, name)
		}
	}
	return result
}

// CheckLocalizationExists 檢查中文化檔案是否已存在
func (a *App) CheckLocalizationExists(scPath string) bool {
	locBase := a.GetLocalizationPath(scPath)
	entries, err := os.ReadDir(locBase)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := strings.ToLower(e.Name())
		if strings.Contains(name, "chinese_(traditional)") || strings.Contains(name, "chinese_(simplified)") || strings.Contains(name, "chinese") || strings.Contains(name, "zh") {
			return true
		}
	}
	return false
}

// CreateLocalizationDir 創建中文化目錄
func (a *App) CreateLocalizationDir(scPath string) error {
	// 建立 Localization 基底資料夾（若不存在）
	base := a.GetLocalizationPath(scPath)
	return os.MkdirAll(base, 0755)
}

// HasLocalizationBase 檢查是否存在 Localization 基底資料夾
func (a *App) HasLocalizationBase(scPath string) bool {
	base := a.GetLocalizationPath(scPath)
	if base == "" {
		return false
	}
	if _, err := os.Stat(base); err == nil {
		return true
	}
	return false
}

// DownloadAndInstallLocalization 從指定 URL 下載 global.ini 並安裝到 LIVE/Localization/chinese_tranditional
func (a *App) DownloadAndInstallLocalization(scPath string, url string) (string, error) {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return "", fmt.Errorf("invalid Star Citizen path")
	}

	// 下載檔案
	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download failed: status %d", resp.StatusCode)
	}

	// 目標路徑：<scPath>/LIVE/data/Localization/chinese_(traditional)/global.ini
	targetDir := filepath.Join(scPath, "LIVE", "data", "Localization", "chinese_(traditional)")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", fmt.Errorf("mkdir failed: %w", err)
	}
	targetFile := filepath.Join(targetDir, "global.ini")

	f, err := os.Create(targetFile)
	if err != nil {
		return "", fmt.Errorf("create file failed: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		return "", fmt.Errorf("write file failed: %w", err)
	}

	return targetFile, nil
}

// SetUserLanguage 設定使用者語系：在 <scPath>/LIVE/data/system.cfg 寫入 sys_languages 與 g_language（若檔案不存在則建立）
func (a *App) SetUserLanguage(scPath string, locale string) (string, error) {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return "", fmt.Errorf("invalid Star Citizen path")
	}
	if strings.TrimSpace(locale) == "" {
		return "", fmt.Errorf("invalid locale")
	}

	liveDir := filepath.Join(scPath, "LIVE", "data")
	if _, err := os.Stat(liveDir); err != nil {
		return "", fmt.Errorf("LIVE directory not found")
	}

	cfgPath := filepath.Join(liveDir, "system.cfg")
	desiredLangLine := "g_language=" + locale
	desiredSysLangLine := "sys_languages=" + locale

	// 如果不存在就直接建立
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		content := desiredSysLangLine + "\n" + desiredLangLine + "\n" + "g_languageAudio=english\n"
		if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
			return "", fmt.Errorf("create user.cfg failed: %w", err)
		}
		return cfgPath, nil
	}

	// 讀取並更新
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return "", fmt.Errorf("read user.cfg failed: %w", err)
	}
	lines := strings.Split(string(data), "\n")
	foundLang := false
	foundSys := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "g_language=") || strings.HasPrefix(trimmed, "g_language ") {
			lines[i] = desiredLangLine
			foundLang = true
		} else if strings.HasPrefix(trimmed, "sys_languages=") || strings.HasPrefix(trimmed, "sys_languages ") {
			lines[i] = desiredSysLangLine
			foundSys = true
		}
	}
	if !foundLang {
		lines = append(lines, desiredLangLine)
	}
	if !foundSys {
		lines = append(lines, desiredSysLangLine)
	}
	updated := strings.Join(lines, "\n")
	if err := os.WriteFile(cfgPath, []byte(updated), 0644); err != nil {
		return "", fmt.Errorf("write user.cfg failed: %w", err)
	}
	return cfgPath, nil
}

// GetUserLanguage 讀取 <scPath>/LIVE/data/system.cfg 的 g_language 值，若不存在或讀取失敗回傳空字串
func (a *App) GetUserLanguage(scPath string) string {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return ""
	}
	cfgPath := filepath.Join(scPath, "LIVE", "data", "system.cfg")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "g_language ") || strings.HasPrefix(trimmed, "g_language=") || strings.HasPrefix(trimmed, "g_language=") {
			// 允許有或沒有空白，抓 '=' 之後的值
			parts := strings.SplitN(strings.ReplaceAll(trimmed, " ", ""), "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

// ResetToDefaultLanguage 刪除 <scPath>/LIVE/data/system.cfg（若存在）以回復原版語系
func (a *App) ResetToDefaultLanguage(scPath string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return fmt.Errorf("invalid Star Citizen path")
	}
	cfgPath := filepath.Join(scPath, "LIVE", "data", "system.cfg")
	if _, err := os.Stat(cfgPath); err == nil {
		if err := os.Remove(cfgPath); err != nil {
			return fmt.Errorf("remove system.cfg failed: %w", err)
		}
	}
	return nil
}

// GetSystemInfo 獲取系統資訊
func (a *App) GetSystemInfo() map[string]string {
	return map[string]string{
		"os":   runtime.GOOS,
		"arch": runtime.GOARCH,
	}
}

// INIKeyValue 表示 INI 檔案中的鍵值對
type INIKeyValue struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ReadINIFile 讀取 INI 檔案並回傳所有鍵值對（保持順序）
func (a *App) ReadINIFile(filePath string) ([]INIKeyValue, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read ini file failed: %w", err)
	}

	// 移除 UTF-8 BOM（如果存在）
	content := string(data)
	content = strings.TrimPrefix(content, "\uFEFF")

	// 統一處理換行符（Windows \r\n 轉為 Unix \n）
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	var result []INIKeyValue
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		// 移除所有類型的空白字符（包括不可見字符）
		line = strings.TrimSpace(line)

		// 跳過空行和註解
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}

		// 解析 key=value
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			// 清理 key 和 value，移除所有不可見字符
			key := cleanString(parts[0])
			value := cleanString(parts[1])

			if key != "" {
				result = append(result, INIKeyValue{
					Key:   key,
					Value: value,
				})
			}
		}
	}
	return result, nil
}

// cleanString 清理字串，移除前後空白和不可見字符
func cleanString(s string) string {
	// 先做基本的 trim
	s = strings.TrimSpace(s)

	// 移除常見的不可見字符
	s = strings.Trim(s, "\u200B\u200C\u200D\uFEFF") // Zero-width spaces and BOM

	return s
}

// CompareResult 比對結果詳細資訊
type CompareResult struct {
	Missing        []INIKeyValue `json:"missing"`        // 缺少的項目
	CurrentCount   int           `json:"currentCount"`   // 當前檔案的項目數量
	ReferenceCount int           `json:"referenceCount"` // 參考檔案的項目數量
}

// CompareINIFiles 比對兩個 INI 檔案，回傳 currentFile 中缺少的項目（相對於 referenceFile）
func (a *App) CompareINIFiles(currentPath, referencePath string) ([]INIKeyValue, error) {
	current, err := a.ReadINIFile(currentPath)
	if err != nil {
		return nil, fmt.Errorf("read current file failed: %w", err)
	}

	reference, err := a.ReadINIFile(referencePath)
	if err != nil {
		return nil, fmt.Errorf("read reference file failed: %w", err)
	}

	// 建立 current 的 key map
	currentKeys := make(map[string]bool)
	for _, item := range current {
		currentKeys[item.Key] = true
	}

	// 找出缺少的項目（保持參考檔案的順序）
	var missing []INIKeyValue
	for _, item := range reference {
		if !currentKeys[item.Key] {
			missing = append(missing, item)
		}
	}

	return missing, nil
}

// CompareINIFilesDetailed 比對兩個 INI 檔案並回傳詳細資訊（用於除錯）
func (a *App) CompareINIFilesDetailed(currentPath, referencePath string) (CompareResult, error) {
	current, err := a.ReadINIFile(currentPath)
	if err != nil {
		return CompareResult{}, fmt.Errorf("read current file failed: %w", err)
	}

	reference, err := a.ReadINIFile(referencePath)
	if err != nil {
		return CompareResult{}, fmt.Errorf("read reference file failed: %w", err)
	}

	// 建立 current 的 key map
	currentKeys := make(map[string]bool)
	for _, item := range current {
		currentKeys[item.Key] = true
	}

	// 找出缺少的項目（保持參考檔案的順序）
	var missing []INIKeyValue
	for _, item := range reference {
		if !currentKeys[item.Key] {
			missing = append(missing, item)
		}
	}

	return CompareResult{
		Missing:        missing,
		CurrentCount:   len(current),
		ReferenceCount: len(reference),
	}, nil
}

// UpdateINIFile 更新 INI 檔案，將新項目按照參考檔案的順序插入
func (a *App) UpdateINIFile(targetPath, referencePath string, updates []INIKeyValue) error {
	// 強制使用 Windows CRLF 與 UTF-8 BOM
	eol, hasBOM := "\r\n", true

	// 讀取參考檔案以獲取正確的順序
	reference, err := a.ReadINIFile(referencePath)
	if err != nil {
		return fmt.Errorf("read reference file failed: %w", err)
	}

	// 讀取目標檔案的現有內容
	current, err := a.ReadINIFile(targetPath)
	if err != nil {
		return fmt.Errorf("read target file failed: %w", err)
	}

	// 建立更新內容的 map
	updateMap := make(map[string]string)
	for _, item := range updates {
		updateMap[item.Key] = item.Value
	}

	// 建立現有內容的 map
	currentMap := make(map[string]string)
	for _, item := range current {
		currentMap[item.Key] = item.Value
	}

	// 合併：按參考檔案的順序，使用更新值（若有）或現有值
	var merged []INIKeyValue
	for _, refItem := range reference {
		if curVal, exists := currentMap[refItem.Key]; exists {
			if newVal, hasUpdate := updateMap[refItem.Key]; hasUpdate {
				// 對既有鍵：若提供更新則覆蓋
				merged = append(merged, INIKeyValue{Key: refItem.Key, Value: newVal})
			} else {
				// 無更新則保留原值
				merged = append(merged, INIKeyValue{Key: refItem.Key, Value: curVal})
			}
		} else if newVal, hasUpdate := updateMap[refItem.Key]; hasUpdate {
			// 新增鍵：使用更新值
			merged = append(merged, INIKeyValue{Key: refItem.Key, Value: newVal})
		}
	}

	// 寫回檔案（保留行尾與 BOM）
	if err := writeINIWithFormat(targetPath, merged, eol, hasBOM); err != nil {
		return err
	}
	return nil
}

// SelectFile 開啟檔案選擇對話框
func (a *App) SelectFile(title string) (string, error) {
	options := wailsRuntime.OpenDialogOptions{
		Title: title,
		Filters: []wailsRuntime.FileFilter{
			{
				DisplayName: "INI Files (*.ini)",
				Pattern:     "*.ini",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	}

	path, err := wailsRuntime.OpenFileDialog(a.ctx, options)
	if err != nil {
		return "", err
	}

	return path, nil
}

// SelectJSONFile 開啟 JSON 檔案選擇對話框
func (a *App) SelectJSONFile(title string) (string, error) {
	options := wailsRuntime.OpenDialogOptions{
		Title: title,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	}
	path, err := wailsRuntime.OpenFileDialog(a.ctx, options)
	if err != nil {
		return "", err
	}
	return path, nil
}

// GetCurrentLocaleINIPath 獲取當前正在使用的語系檔案路徑
func (a *App) GetCurrentLocaleINIPath(scPath string) (string, error) {
	currentLocale := a.GetUserLanguage(scPath)
	if currentLocale == "" {
		return "", fmt.Errorf("no locale configured")
	}

	// 嘗試各個版本資料夾
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	for _, vf := range versionFolders {
		iniPath := filepath.Join(scPath, vf, "data", "Localization", currentLocale, "global.ini")
		if _, err := os.Stat(iniPath); err == nil {
			return iniPath, nil
		}
	}

	return "", fmt.Errorf("locale ini file not found for: %s", currentLocale)
}

// SaveFile 開啟另存為對話框，回傳使用者選擇的完整檔案路徑
func (a *App) SaveFile(title string, defaultFilename string) (string, error) {
	options := wailsRuntime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultFilename,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "INI Files (*.ini)", Pattern: "*.ini"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	}
	path, err := wailsRuntime.SaveFileDialog(a.ctx, options)
	if err != nil {
		return "", err
	}
	return path, nil
}

// SaveTextFile 開啟另存為對話框並將文字內容寫入選擇的檔案
func (a *App) SaveTextFile(title string, defaultFilename string, content string) (string, error) {
	options := wailsRuntime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultFilename,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
			{DisplayName: "Text Files (*.txt)", Pattern: "*.txt"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	}
	path, err := wailsRuntime.SaveFileDialog(a.ctx, options)
	if err != nil {
		return "", err
	}
	if path == "" {
		// 使用者取消
		return "", nil
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("write file failed: %w", err)
	}
	return path, nil
}

// ExportLocaleFile 將指定語系的 global.ini 匯出到目標路徑
func (a *App) ExportLocaleFile(scPath string, localeName string, destFile string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return fmt.Errorf("invalid Star Citizen path")
	}
	if strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("invalid locale name")
	}
	if strings.TrimSpace(destFile) == "" {
		return fmt.Errorf("invalid destination path")
	}

	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	var src string
	for _, vf := range versionFolders {
		p := filepath.Join(scPath, vf, "data", "Localization", localeName, "global.ini")
		if _, err := os.Stat(p); err == nil {
			src = p
			break
		}
	}
	if src == "" {
		return fmt.Errorf("global.ini not found for locale: %s", localeName)
	}

	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read source failed: %w", err)
	}
	if err := os.WriteFile(destFile, data, 0644); err != nil {
		return fmt.Errorf("write destination failed: %w", err)
	}
	return nil
}

// ExportLocaleFileStripped 匯出指定語系的 global.ini，並針對含 vehicle_Name 的鍵移除值前方的 3 碼排序前綴（例如："001 ")
func (a *App) ExportLocaleFileStripped(scPath string, localeName string, destFile string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return fmt.Errorf("invalid Star Citizen path")
	}
	if strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("invalid locale name")
	}
	if strings.TrimSpace(destFile) == "" {
		return fmt.Errorf("invalid destination path")
	}

	// 尋找來源檔案（LIVE / PTU / EPTU）
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	var src string
	for _, vf := range versionFolders {
		p := filepath.Join(scPath, vf, "data", "Localization", localeName, "global.ini")
		if _, err := os.Stat(p); err == nil {
			src = p
			break
		}
	}
	if src == "" {
		return fmt.Errorf("global.ini not found for locale: %s", localeName)
	}

	// 讀取並解析來源 INI
	items, err := a.ReadINIFile(src)
	if err != nil {
		return fmt.Errorf("read source failed: %w", err)
	}

	// 從 Sort/active.json 取得目前使用中的 baseKeys 清單
	activeSet := map[string]struct{}{}
	{
		baseSort := a.GetSortBasePath(scPath)
		if baseSort != "" {
			activePath := filepath.Join(baseSort, "active.json")
			if data, err := os.ReadFile(activePath); err == nil {
				var vo VehicleOrder
				if json.Unmarshal(data, &vo) == nil && vo.Type == "vehicle_order" && vo.Version > 0 && len(vo.BaseKeys) > 0 {
					for _, k := range vo.BaseKeys {
						activeSet[k] = struct{}{}
					}
				}
			}
		}
	}

	// 只有 baseKey 在 active.json 的 vehicle_Name 項目才移除排序前綴
	cleaned := make([]INIKeyValue, 0, len(items))
	for _, it := range items {
		if strings.Contains(strings.ToLower(it.Key), "vehicle_name") {
			// 計算 baseKey 與前端一致的規則：_short,p -> ",P"；_short -> 去除後綴；其他維持
			keyLower := strings.ToLower(it.Key)
			baseKey := it.Key
			if strings.HasSuffix(keyLower, "_short,p") {
				baseKey = it.Key[:len(it.Key)-len("_short,p")] + ",P"
			} else if strings.HasSuffix(keyLower, "_short") {
				baseKey = it.Key[:len(it.Key)-len("_short")]
			}

			if _, ok := activeSet[baseKey]; ok {
				v := it.Value
				if len(v) >= 4 {
					if v[0] >= '0' && v[0] <= '9' && v[1] >= '0' && v[1] <= '9' && v[2] >= '0' && v[2] <= '9' && (v[3] == ' ' || v[3] == '\t') {
						v = v[4:]
					}
				}
				cleaned = append(cleaned, INIKeyValue{Key: it.Key, Value: v})
				continue
			}
		}
		cleaned = append(cleaned, it)
	}

	// 使用既定格式（Windows CRLF + UTF-8 BOM）寫出到目的檔案
	if err := writeINIWithFormat(destFile, cleaned, "\r\n", true); err != nil {
		return err
	}
	return nil
}

// GetSortBasePath 回傳與 Localization 同層的 Sort 目錄路徑（優先回傳存在的版本目錄）
func (a *App) GetSortBasePath(scPath string) string {
	if scPath == "" {
		return ""
	}
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	for _, vf := range versionFolders {
		base := filepath.Join(scPath, vf)
		if _, err := os.Stat(base); err == nil {
			return filepath.Join(base, "data", "Sort")
		}
	}
	return filepath.Join(scPath, "LIVE", "data", "Sort")
}

// EnsureSortDirs 確保 Sort 與 Sort/save 目錄存在
func (a *App) EnsureSortDirs(scPath string) (string, string, error) {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return "", "", fmt.Errorf("invalid Star Citizen path")
	}
	base := a.GetSortBasePath(scPath)
	if err := os.MkdirAll(base, 0755); err != nil {
		return "", "", err
	}
	save := filepath.Join(base, "save")
	if err := os.MkdirAll(save, 0755); err != nil {
		return "", "", err
	}
	return base, save, nil
}

type VehicleOrder struct {
	Type     string   `json:"type"`
	Version  int      `json:"version"`
	BaseKeys []string `json:"baseKeys"`
}

// SaveVehicleOrderActive 寫入 active.json（不建立時機由前端控制）
func (a *App) SaveVehicleOrderActive(scPath string, baseKeys []string) (string, error) {
	base, _, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return "", err
	}
	vo := VehicleOrder{Type: "vehicle_order", Version: 1, BaseKeys: baseKeys}
	data, err := json.MarshalIndent(vo, "", "  ")
	if err != nil {
		return "", err
	}
	dest := filepath.Join(base, "active.json")
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return "", err
	}
	return dest, nil
}

// SaveVehicleOrderAs 另存新檔到 save 目錄，回傳完整路徑
func (a *App) SaveVehicleOrderAs(scPath string, name string, baseKeys []string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("name is required")
	}
	// 簡單過濾檔名
	safe := strings.TrimSpace(name)
	safe = strings.ReplaceAll(safe, "\\", "_")
	safe = strings.ReplaceAll(safe, "/", "_")
	safe = strings.ReplaceAll(safe, ":", "_")
	safe = strings.ReplaceAll(safe, "*", "_")
	safe = strings.ReplaceAll(safe, "?", "_")
	safe = strings.ReplaceAll(safe, "\"", "_")
	safe = strings.ReplaceAll(safe, "<", "_")
	safe = strings.ReplaceAll(safe, ">", "_")
	safe = strings.ReplaceAll(safe, "|", "_")

	_, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return "", err
	}
	dest := filepath.Join(saveDir, safe+".json")
	vo := VehicleOrder{Type: "vehicle_order", Version: 1, BaseKeys: baseKeys}
	data, err := json.MarshalIndent(vo, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return "", err
	}
	return dest, nil
}

// GetActiveVehicleOrder 讀取 Sort/active.json 並回傳 BaseKeys（若不存在則回傳空陣列）
func (a *App) GetActiveVehicleOrder(scPath string) ([]string, error) {
	base, _, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return nil, err
	}
	active := filepath.Join(base, "active.json")
	data, err := os.ReadFile(active)
	if err != nil {
		// 不存在或讀取失敗即回傳空
		return []string{}, nil
	}
	var vo VehicleOrder
	if err := json.Unmarshal(data, &vo); err != nil {
		return []string{}, nil
	}
	if vo.Type != "vehicle_order" || vo.Version <= 0 {
		return []string{}, nil
	}
	return vo.BaseKeys, nil
}

// getLocaleINIPath 找出特定語系名稱的 global.ini 路徑
func (a *App) getLocaleINIPath(scPath, localeName string) (string, error) {
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	for _, vf := range versionFolders {
		p := filepath.Join(scPath, vf, "data", "Localization", localeName, "global.ini")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("global.ini not found for locale: %s", localeName)
}

// makeBaseKey 與前端一致：_short,p -> ,P；_short -> 去除；其他維持
func makeBaseKey(key string) string {
	kl := strings.ToLower(key)
	if strings.HasSuffix(kl, "_short,p") {
		return key[:len(key)-len("_short,p")] + ",P"
	}
	if strings.HasSuffix(kl, "_short") {
		return key[:len(key)-len("_short")]
	}
	return key
}

// stripPrefix 若值為 NNN␠ 開頭則去除
func stripPrefix(val string) string {
	if len(val) >= 4 && val[0] >= '0' && val[0] <= '9' && val[1] >= '0' && val[1] <= '9' && val[2] >= '0' && val[2] <= '9' && (val[3] == ' ' || val[3] == '\t') {
		return val[4:]
	}
	return val
}

// ApplyActiveVehicleOrderToLocale 讀取 active.json，將排序套用到指定語系檔（存在於清單者加 NNN 前綴，其他移除）
func (a *App) ApplyActiveVehicleOrderToLocale(scPath, localeName string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) || strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("invalid params")
	}
	// 取得 active baseKeys
	baseKeys, _ := a.GetActiveVehicleOrder(scPath)
	if len(baseKeys) == 0 {
		// 無排序即不動
		return nil
	}
	iniPath, err := a.getLocaleINIPath(scPath, localeName)
	if err != nil {
		return err
	}
	items, err := a.ReadINIFile(iniPath)
	if err != nil {
		return err
	}

	orderMap := map[string]int{}
	for i, k := range baseKeys {
		orderMap[k] = i + 1
	}

	newItems := make([]INIKeyValue, 0, len(items))
	for _, it := range items {
		if strings.Contains(strings.ToLower(it.Key), "vehicle_name") {
			base := makeBaseKey(it.Key)
			clean := stripPrefix(it.Value)
			if ord, ok := orderMap[base]; ok {
				// 加前綴
				v := fmt.Sprintf("%03d %s", ord, clean)
				newItems = append(newItems, INIKeyValue{Key: it.Key, Value: v})
				continue
			}
			// 其他移除前綴
			newItems = append(newItems, INIKeyValue{Key: it.Key, Value: clean})
		} else {
			newItems = append(newItems, it)
		}
	}
	return writeINIWithFormat(iniPath, newItems, "\r\n", true)
}

// StripActiveVehicleOrderFromLocale 讀取 active.json，僅對其中 baseKeys 的載具移除前綴
func (a *App) StripActiveVehicleOrderFromLocale(scPath, localeName string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) || strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("invalid params")
	}
	baseKeys, _ := a.GetActiveVehicleOrder(scPath)
	if len(baseKeys) == 0 {
		return nil
	}
	iniPath, err := a.getLocaleINIPath(scPath, localeName)
	if err != nil {
		return err
	}
	items, err := a.ReadINIFile(iniPath)
	if err != nil {
		return err
	}
	set := map[string]struct{}{}
	for _, k := range baseKeys {
		set[k] = struct{}{}
	}

	newItems := make([]INIKeyValue, 0, len(items))
	for _, it := range items {
		if strings.Contains(strings.ToLower(it.Key), "vehicle_name") {
			base := makeBaseKey(it.Key)
			if _, ok := set[base]; ok {
				newItems = append(newItems, INIKeyValue{Key: it.Key, Value: stripPrefix(it.Value)})
				continue
			}
		}
		newItems = append(newItems, it)
	}
	return writeINIWithFormat(iniPath, newItems, "\r\n", true)
}

// ListVehicleOrderSaves 列出 save 目錄下的檔名（不含副檔名）
func (a *App) ListVehicleOrderSaves(scPath string) ([]string, error) {
	_, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(saveDir)
	if err != nil {
		return []string{}, nil
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(strings.ToLower(name), ".json") {
			names = append(names, strings.TrimSuffix(name, filepath.Ext(name)))
		}
	}
	sort.Strings(names)
	return names, nil
}

// ExportVehicleOrderFile 將 save/<name>.json 匯出到指定路徑
func (a *App) ExportVehicleOrderFile(scPath string, name string, destFile string) error {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(destFile) == "" {
		return fmt.Errorf("invalid params")
	}
	_, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return err
	}
	src := filepath.Join(saveDir, name+".json")
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.WriteFile(destFile, data, 0644); err != nil {
		return err
	}
	return nil
}

// ImportVehicleOrderFile 複製外部 JSON 到 save 目錄（使用原檔名）
func (a *App) ImportVehicleOrderFile(scPath string, sourceFilePath string) (string, error) {
	if strings.TrimSpace(sourceFilePath) == "" {
		return "", fmt.Errorf("source path required")
	}
	data, err := os.ReadFile(sourceFilePath)
	if err != nil {
		return "", err
	}
	// 簡單驗證型別
	var vo VehicleOrder
	if err := json.Unmarshal(data, &vo); err != nil {
		return "", fmt.Errorf("invalid json: %w", err)
	}
	if vo.Type != "vehicle_order" || vo.Version <= 0 {
		return "", fmt.Errorf("unsupported vehicle_order json")
	}
	_, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return "", err
	}
	base := filepath.Base(sourceFilePath)
	if strings.ToLower(filepath.Ext(base)) != ".json" {
		base = base + ".json"
	}
	dest := filepath.Join(saveDir, base)
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return "", err
	}
	return dest, nil
}

// SetActiveVehicleOrderByName 以 save/<name>.json 覆蓋 active.json，回傳 BaseKeys
func (a *App) SetActiveVehicleOrderByName(scPath string, name string) ([]string, error) {
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("name is required")
	}
	base, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return nil, err
	}
	src := filepath.Join(saveDir, name+".json")
	data, err := os.ReadFile(src)
	if err != nil {
		return nil, err
	}
	var vo VehicleOrder
	if err := json.Unmarshal(data, &vo); err != nil {
		return nil, fmt.Errorf("invalid json: %w", err)
	}
	if vo.Type != "vehicle_order" || vo.Version <= 0 {
		return nil, fmt.Errorf("unsupported vehicle_order json")
	}
	// 寫入 active.json
	dest := filepath.Join(base, "active.json")
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return nil, err
	}
	return vo.BaseKeys, nil
}

// DeleteVehicleOrderSave 刪除 save/<name>.json
func (a *App) DeleteVehicleOrderSave(scPath string, name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("name is required")
	}
	_, saveDir, err := a.EnsureSortDirs(scPath)
	if err != nil {
		return err
	}
	target := filepath.Join(saveDir, name+".json")
	if _, err := os.Stat(target); os.IsNotExist(err) {
		return nil
	}
	if err := os.Remove(target); err != nil {
		return err
	}
	return nil
}

// DeleteLocalization 刪除指定語系資料夾（嘗試 LIVE/PTU/EPTU），不存在則跳過
func (a *App) DeleteLocalization(scPath string, localeName string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return fmt.Errorf("invalid Star Citizen path")
	}
	if strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("invalid locale name")
	}
	// 防呆：使用中的語系不得刪除
	if current := a.GetUserLanguage(scPath); current != "" && current == localeName {
		return fmt.Errorf("cannot delete locale currently in use")
	}
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	var lastErr error
	var deleted bool
	for _, vf := range versionFolders {
		dir := filepath.Join(scPath, vf, "data", "Localization", localeName)
		if _, err := os.Stat(dir); err == nil {
			if err := os.RemoveAll(dir); err != nil {
				lastErr = err
				continue
			}
			deleted = true
		}
	}
	if !deleted && lastErr != nil {
		return lastErr
	}
	return nil
}

// WriteINIFile 寫入 INI 檔案
func (a *App) WriteINIFile(filePath string, items []INIKeyValue) error {
	// 強制使用 Windows CRLF 與 UTF-8 BOM
	eol, hasBOM := "\r\n", true
	if err := writeINIWithFormat(filePath, items, eol, hasBOM); err != nil {
		return err
	}
	return nil
}

// detectFileFormat 嘗試從既有檔案偵測行尾(EOL)與是否含 UTF-8 BOM
func detectFileFormat(filePath string) (string, bool) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		// 檔案不存在或讀取失敗時，採用 Windows CRLF 與 UTF-8 BOM
		return "\r\n", true
	}
	hasBOM := len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF
	// 判斷行尾：若含 \r\n 則視為 CRLF，否則預設為 LF
	content := string(data)
	eol := "\n"
	if strings.Contains(content, "\r\n") {
		eol = "\r\n"
	}
	return eol, hasBOM
}

// writeINIWithFormat 依指定行尾與 BOM 寫入 INI 檔案
func writeINIWithFormat(filePath string, items []INIKeyValue, eol string, hasBOM bool) error {
	// 依 Key 文字順序排序（不分大小寫）
	sorted := make([]INIKeyValue, len(items))
	copy(sorted, items)
	sort.Slice(sorted, func(i, j int) bool {
		ai := strings.ToLower(sorted[i].Key)
		aj := strings.ToLower(sorted[j].Key)
		return ai < aj
	})

	var lines []string
	for _, item := range sorted {
		lines = append(lines, fmt.Sprintf("%s=%s", item.Key, item.Value))
	}
	contentStr := strings.Join(lines, eol) + eol
	content := []byte(contentStr)
	if hasBOM {
		content = append([]byte{0xEF, 0xBB, 0xBF}, content...)
	}
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return fmt.Errorf("write file failed: %w", err)
	}
	return nil
}

// ImportLocaleFile 匯入語系檔案到指定的語系名稱資料夾
func (a *App) ImportLocaleFile(scPath, localeName, sourceFilePath string) error {
	if scPath == "" || !a.ValidateStarCitizenPath(scPath) {
		return fmt.Errorf("invalid Star Citizen path")
	}
	if strings.TrimSpace(localeName) == "" {
		return fmt.Errorf("locale name is required")
	}
	if sourceFilePath == "" {
		return fmt.Errorf("source file path is required")
	}

	// 檢查來源檔案是否存在
	if _, err := os.Stat(sourceFilePath); os.IsNotExist(err) {
		return fmt.Errorf("source file does not exist: %s", sourceFilePath)
	}

	// 嘗試各個版本資料夾（通常會安裝到 LIVE）
	versionFolders := []string{"LIVE", "PTU", "EPTU"}
	var lastErr error

	for _, vf := range versionFolders {
		targetDir := filepath.Join(scPath, vf, "data", "Localization", localeName)

		// 建立目標資料夾
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			lastErr = err
			continue
		}

		// 複製檔案
		targetFile := filepath.Join(targetDir, "global.ini")
		sourceData, err := os.ReadFile(sourceFilePath)
		if err != nil {
			lastErr = err
			continue
		}

		if err := os.WriteFile(targetFile, sourceData, 0644); err != nil {
			lastErr = err
			continue
		}

		// 成功寫入至少一個版本資料夾就回傳成功
		return nil
	}

	if lastErr != nil {
		return fmt.Errorf("failed to import locale file: %w", lastErr)
	}

	return fmt.Errorf("no valid version folder found")
}
