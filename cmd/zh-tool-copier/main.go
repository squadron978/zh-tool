package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	gamePath := flag.String("game", "", "Star Citizen 安裝根目錄 (e.g. C:\\Program Files\\Roberts Space Industries\\StarCitizen)")
	srcFile := flag.String("source", "", "要套用的 global.ini 來源檔案")
	locale := flag.String("locale", "chinese_(traditional)", "語系資料夾名稱")
	flag.Parse()

	if err := run(*gamePath, *srcFile, *locale); err != nil {
		// 盡量寫入本機使用者可寫日誌，便於回報
		_ = writeLog(fmt.Sprintf("ERROR: %v", err))
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	_ = writeLog("SUCCESS: localization applied")
}

func run(gameRoot, source, locale string) error {
	if strings.TrimSpace(gameRoot) == "" || strings.TrimSpace(source) == "" || strings.TrimSpace(locale) == "" {
		return errors.New("missing required arguments: --game, --source, --locale")
	}
	if !validateGamePath(gameRoot) {
		return fmt.Errorf("invalid game path: %s", gameRoot)
	}
	if st, err := os.Stat(source); err != nil || st.IsDir() {
		return fmt.Errorf("invalid source file: %s", source)
	}

	// 僅允許 LIVE 版本，降低風險
	targetDir := filepath.Join(gameRoot, "LIVE", "data", "Localization", locale)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	target := filepath.Join(targetDir, "global.ini")

	// 備份舊檔（若存在且尚無 .bak）
	if _, err := os.Stat(target); err == nil {
		bak := target + ".bak"
		if _, err := os.Stat(bak); os.IsNotExist(err) {
			if err := copyFile(target, bak); err != nil {
				return fmt.Errorf("backup old file failed: %w", err)
			}
		}
	}

	// 原子替換：寫到 .tmp 再替換
	tmp := target + ".tmp"
	if err := copyFile(source, tmp); err != nil {
		return fmt.Errorf("write temp failed: %w", err)
	}
	if err := os.Rename(tmp, target); err != nil {
		// 若跨磁碟區導致 Rename 失敗，退回以 Copy + Remove 實現
		if err2 := os.Remove(target); err2 == nil {
			if err3 := copyFile(source, target); err3 != nil {
				return fmt.Errorf("replace failed: %v", err3)
			}
		} else {
			return fmt.Errorf("replace failed: %v", err)
		}
	}
	return nil
}

func validateGamePath(p string) bool {
	indicators := []string{
		filepath.Join(p, "Bin64"),
		filepath.Join(p, "Data"),
		filepath.Join(p, "data.p4k"),
		filepath.Join(p, "LIVE"),
	}
	for _, x := range indicators {
		if _, err := os.Stat(x); err == nil {
			return true
		}
	}
	return false
}

func copyFile(src, dst string) error {
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	// 0644 避免過寬權限
	d, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer d.Close()
	if _, err := io.Copy(d, s); err != nil {
		return err
	}
	return nil
}

func writeLog(line string) error {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return nil
	}
	dir := filepath.Join(base, "zh-tool", "logs")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil
	}
	f := filepath.Join(dir, fmt.Sprintf("copier-%s.log", time.Now().Format("20060102")))
	fp, err := os.OpenFile(f, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil
	}
	defer fp.Close()
	_, _ = fp.WriteString(time.Now().Format(time.RFC3339) + " " + line + "\n")
	return nil
}
