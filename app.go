package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
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
