package main

import (
	"context"
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

	// 合併：按參考檔案的順序，使用現有值或更新值
	var merged []INIKeyValue
	for _, refItem := range reference {
		if val, exists := currentMap[refItem.Key]; exists {
			// 如果當前檔案已有此 key，保留現有值
			merged = append(merged, INIKeyValue{Key: refItem.Key, Value: val})
		} else if val, exists := updateMap[refItem.Key]; exists {
			// 如果是新增的項目，使用更新值
			merged = append(merged, INIKeyValue{Key: refItem.Key, Value: val})
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
