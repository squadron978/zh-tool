import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';

// 定義 INI 鍵值對類型
interface INIKeyValue {
  key: string;
  value: string;
}

// 重複鍵的列資訊（行數以解析結果順序為準，1-based）
interface DuplicateRow {
  key: string;
  value: string;
  lineNumber: number;
}

export const LocaleCompare = () => {
  const { scPath, isPathValid } = useAppStore();
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [referenceFilePath, setReferenceFilePath] = useState('');
  const [missingKeys, setMissingKeys] = useState<INIKeyValue[]>([]);
  const [editedValues, setEditedValues] = useState<{ [key: string]: string }>({});
  const [selectedKeys, setSelectedKeys] = useState<{ [key: string]: boolean }>({});
  const [selectAll, setSelectAll] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasChineseLocale, setHasChineseLocale] = useState(false);
  const [compareStats, setCompareStats] = useState<{ currentCount: number; referenceCount: number } | null>(null);
  const [compareMode, setCompareMode] = useState<'missing' | 'value' | 'duplicateKeys' | 'searchValue'>('missing');
  const [duplicateRows, setDuplicateRows] = useState<DuplicateRow[]>([]);
  const [deletingLine, setDeletingLine] = useState<number | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<DuplicateRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // 結果清單模糊搜尋（適用於 missing/value/duplicateKeys）
  const [resultSearchKeyword, setResultSearchKeyword] = useState('');

  // 虛擬滾動相關（參考編輯語系檔案的逐步載入）
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(450);
  const containerRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 80; // 估計每列高度（與編輯頁一致）

  // 計算可見行數
  const VISIBLE_ROWS = Math.ceil(containerHeight / ROW_HEIGHT);

  // 動態計算容器高度（根據容器頂部到視窗底部的距離）
  useEffect(() => {
    const calculateHeight = () => {
      const windowHeight = window.innerHeight;
      const el = containerRef.current;
      const top = el ? el.getBoundingClientRect().top : 200;
      const bottomPadding = 16; // 底部留白
      const newHeight = Math.max(500, Math.min(700, windowHeight - top - bottomPadding));
      setContainerHeight(newHeight);
    };

    // 初始計算與監聽視窗大小
    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  // 用於比對時的字串正規化：
  // - 標準化換行為 \n
  // - 移除前後空白
  // - 去除成對包覆的雙引號（若有）
  const normalizeForCompare = (value: string | undefined | null): string => {
    if (value == null) return '';
    let v = String(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Unicode 正規化（避免全形/相容字、結合字差異）
    try {
      v = v.normalize('NFC');
    } catch {}

    // 去除常見的不可見字元與 BOM/ZWSP 類
    v = v.replace(/[\u200B-\u200D\uFEFF\u2060\u180E]/g, '');

    // 統一空白類型：全形空白/不換行空白 -> 半形空白
    v = v.replace(/[\u3000\u00A0]/g, ' ');

    // 將連續的空白或 Tab 收斂成單一空白
    v = v.replace(/[ \t]+/g, ' ');

    // 去除成對外層引號（單引號或雙引號）
    v = v.trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1).trim();
    }
    return v;
  };

  // 切換比對模式時，重置比對結果與選取狀態
  useEffect(() => {
    setMissingKeys([]);
    setEditedValues({});
    setSelectedKeys({});
    setSelectAll(false);
    setCompareStats(null);
    setMessage(null);
    setDuplicateRows([]);
    setDeletingLine(null);
    setSearchQuery('');
    setResultSearchKeyword('');
    // 重置清單滾動位置
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [compareMode]);

  // 檢查是否有 chinese_(traditional) 語系
  useEffect(() => {
    const checkCurrentLocale = async () => {
      if (!isPathValid || !scPath) {
        setHasChineseLocale(false);
        setCurrentFilePath('');
        return;
      }

      try {
        const { GetCurrentLocaleINIPath, ListInstalledLocalizations } = await import('../../wailsjs/go/main/App');
        
        // 檢查是否有安裝的語系
        const locales = await ListInstalledLocalizations(scPath);
        const hasChinese = Array.isArray(locales) && locales.includes('chinese_(traditional)');
        setHasChineseLocale(hasChinese);

        // 嘗試獲取當前語系檔案路徑
        try {
          const currentPath = await GetCurrentLocaleINIPath(scPath);
          setCurrentFilePath(currentPath);
          setMessage(null);
        } catch (e: any) {
          setCurrentFilePath('');
          // 根據情況顯示不同的提示
          if (!hasChinese) {
            setMessage({
              type: 'info',
              text: '尚未安裝 chinese_(traditional) 語系，請先前往自動中文化頁籤進行安裝。'
            });
          } else {
            setMessage({
              type: 'info',
              text: '尚未設定語系，請先前往語系檔管理頁籤切換至任一語系。'
            });
          }
        }
      } catch (e) {
        console.error('檢查語系失敗:', e);
        setHasChineseLocale(false);
        setCurrentFilePath('');
      }
    };

    void checkCurrentLocale();
  }, [scPath, isPathValid]);

  // 選擇參考檔案
  const handleSelectReference = async () => {
    try {
      const { SelectFile } = await import('../../wailsjs/go/main/App');
      const path = await SelectFile('選擇參考語系檔案 (global.ini)');
      if (path) {
        setReferenceFilePath(path);
        setMissingKeys([]);
        setEditedValues({});
        setSelectedKeys({});
        setSelectAll(false);
        setCompareStats(null);
        setMessage(null);
        setDuplicateRows([]);
        setDeletingLine(null);
      }
    } catch (e: any) {
      console.error('選擇檔案失敗:', e);
    }
  };

  // 執行比對
  const handleCompare = async () => {
    if (!currentFilePath) {
      setMessage({ type: 'error', text: '找不到當前語系檔案' });
      return;
    }
    if ((compareMode === 'missing' || compareMode === 'value' || compareMode === 'searchValue') && !referenceFilePath) {
      setMessage({ type: 'error', text: '請先選擇參考檔案' });
      return;
    }
    if (compareMode === 'searchValue' && !searchQuery.trim()) {
      setMessage({ type: 'info', text: '請先輸入搜尋條件' });
      return;
    }

    setIsComparing(true);
    setMessage(null);
    setCompareStats(null);

    try {
      const { ReadINIFile, CompareINIFiles } = await import('../../wailsjs/go/main/App');
      
      // duplicateKeys 模式僅需當前檔案
      const [currentItems, referenceItems, missing] = compareMode === 'duplicateKeys'
        ? [await ReadINIFile(currentFilePath), null as any, null as any]
        : await Promise.all([
            ReadINIFile(currentFilePath),
            ReadINIFile(referenceFilePath),
            CompareINIFiles(currentFilePath, referenceFilePath)
          ]);

      // 設定統計資訊
      setCompareStats({
        currentCount: currentItems?.length || 0,
        referenceCount: (referenceItems as any)?.length || 0
      });

      // 依模式建立差異清單
      let differences: INIKeyValue[] = [];
      const currentMap = new Map<string, string>((currentItems || []).map((it: INIKeyValue) => [it.key, it.value]));
      if (compareMode === 'duplicateKeys') {
        // 找出重複鍵，並記錄每列的行數（以解析結果順序為準）
        const keyToRows = new Map<string, DuplicateRow[]>();
        (currentItems || []).forEach((it: INIKeyValue, idx: number) => {
          const arr = keyToRows.get(it.key) || [];
          arr.push({ key: it.key, value: it.value, lineNumber: idx + 1 });
          keyToRows.set(it.key, arr);
        });
        const dups: DuplicateRow[] = [];
        keyToRows.forEach((rows) => {
          if (rows.length > 1) {
            dups.push(...rows);
          }
        });
        setDuplicateRows(dups);
        if (dups.length > 0) {
          setMessage({ type: 'info', text: `找到 ${dups.length} 列重複鍵（含同鍵的所有出現列）` });
        } else {
          setMessage({ type: 'success', text: '沒有重複鍵！' });
        }
        // 其餘模式的狀態清空
        setMissingKeys([]);
        setEditedValues({});
        setSelectedKeys({});
        setSelectAll(false);
        return;
      } else if (compareMode === 'value' || compareMode === 'searchValue') {
        const referenceMap = new Map<string, string>((referenceItems || []).map((it: INIKeyValue) => [it.key, it.value]));
        const currentMapForValue = new Map<string, string>((currentItems || []).map((it: INIKeyValue) => [it.key, it.value]));
        const q = normalizeForCompare(searchQuery).toLowerCase();

        if (compareMode === 'value') {
          // 只列出「不同值」的項目（僅針對同時存在於兩邊的鍵）
          (currentItems || []).forEach((cur: INIKeyValue) => {
            const refVal = referenceMap.get(cur.key);
            if (typeof refVal === 'string') {
              const nRef = normalizeForCompare(refVal);
              const nCur = normalizeForCompare(cur.value);
              const isDiff = nRef !== nCur;
              if (isDiff) {
                differences.push({ key: cur.key, value: refVal });
              }
            }
          });
        } else {
          // searchValue：列出「任一邊的值或 Key 符合搜尋」的項目，不要求不同
          const refKeys = new Set<string>((referenceItems || []).map((it: INIKeyValue) => it.key));
          const curKeys = new Set<string>((currentItems || []).map((it: INIKeyValue) => it.key));
          const unionKeys = new Set<string>([...Array.from(refKeys), ...Array.from(curKeys)]);

          // 優先依參考檔案順序，其次把當前檔案中有但參考沒有的附在後面
          const orderedKeys: string[] = [];
          (referenceItems || []).forEach((it: INIKeyValue) => orderedKeys.push(it.key));
          (currentItems || []).forEach((it: INIKeyValue) => { if (!refKeys.has(it.key)) orderedKeys.push(it.key); });

          orderedKeys.forEach((key) => {
            if (!unionKeys.has(key)) return;
            const refVal = referenceMap.get(key) || '';
            const curVal = currentMapForValue.get(key) || '';
            const nRef = normalizeForCompare(refVal).toLowerCase();
            const nCur = normalizeForCompare(curVal).toLowerCase();
            const keyHit = key.toLowerCase().includes(q);
            const refHit = nRef.includes(q);
            const curHit = nCur.includes(q);
            if (q.length > 0 && (keyHit || refHit || curHit)) {
              // value 欄保留參考檔案值，右欄使用 editedValues 顯示原檔值
              differences.push({ key, value: refVal });
            }
          });
        }
      } else {
        differences = missing || [];
      }

      if (differences && differences.length > 0) {
        setMissingKeys(differences);
        // 初始化編輯值：
        // - 缺失模式：預設為參考檔案值
        // - 比對值/比對指定值模式：預設為原檔案值（僅顯示）
        const initialValues: { [key: string]: string } = {};
        const initialSelected: { [key: string]: boolean } = {};
        differences.forEach((item) => {
          initialValues[item.key] = (compareMode === 'value' || compareMode === 'searchValue') ? (currentMap.get(item.key) || '') : item.value;
          // 預設不全選
          initialSelected[item.key] = false;
        });
        setEditedValues(initialValues);
        setSelectedKeys(initialSelected);
        setSelectAll(false);
        setMessage({ type: 'info', text: `找到 ${differences.length} 個${compareMode === 'value' ? '差異' : compareMode === 'searchValue' ? '符合搜尋' : '缺少'}的項目` });
      } else {
        setMissingKeys([]);
        setEditedValues({});
        setSelectedKeys({});
        setSelectAll(false);
        setMessage({ type: 'success', text: `沒有${compareMode === 'value' ? '差異' : compareMode === 'searchValue' ? '符合條件且不同' : '缺少的項目'}，兩個檔案完全一致！` });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `比對失敗：${e?.message || e}` });
      setMissingKeys([]);
      setEditedValues({});
      setSelectedKeys({});
      setCompareStats(null);
    } finally {
      setIsComparing(false);
    }
  };

  // 全選/取消全選（僅作用於目前篩選後顯示的清單）
  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    const newSelected: { [key: string]: boolean } = {};
    filteredDiffItems.forEach((item) => {
      newSelected[item.key] = newSelectAll;
    });
    setSelectedKeys(newSelected);
  };

  // 切換單個選擇
  const handleToggleSelect = (key: string) => {
    const newSelected = { ...selectedKeys, [key]: !selectedKeys[key] };
    setSelectedKeys(newSelected);
    // 檢查是否全選
    const allSelected = filteredDiffItems.length > 0 && filteredDiffItems.every((item) => newSelected[item.key]);
    setSelectAll(allSelected);
  };

  // 儲存更新
  const handleSave = async () => {
    if (!currentFilePath || !referenceFilePath || missingKeys.length === 0) {
      return;
    }

    // 只儲存已勾選的項目
    const selectedItems = missingKeys.filter((item) => selectedKeys[item.key]);
    if (selectedItems.length === 0) {
      setMessage({ type: 'error', text: '請至少勾選一個項目' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { UpdateINIFile } = await import('../../wailsjs/go/main/App');
      
      // 準備要更新的項目（只包含已勾選的）
      // - 缺失模式：以使用者輸入（空或未填則取參考值）
      // - 比對值模式：以「原檔案的值」欄位（可編輯）為準
      const updates: INIKeyValue[] = selectedItems.map((item) => {
        if (compareMode === 'value') {
          return { key: item.key, value: editedValues[item.key] ?? '' };
        }
        // missing/searchValue：searchValue 不可儲存已被禁止；missing 需要 fallback 到參考值
        const userInput = editedValues[item.key];
        const finalVal = (typeof userInput === 'string' && userInput.trim().length > 0) ? userInput : item.value;
        return { key: item.key, value: finalVal };
      });

      await UpdateINIFile(currentFilePath, referenceFilePath, updates);
      // 依需求：更新後不要重新比對或移除列，保持目前清單與編輯狀態不變
      setMessage({ type: 'success', text: `成功更新 ${updates.length} 個項目` });
    } catch (e: any) {
      setMessage({ type: 'error', text: `儲存失敗：${e?.message || e}` });
    } finally {
      setIsSaving(false);
    }
  };

  // 匯出為檔案
  const handleExport = async () => {
    if (missingKeys.length === 0) {
      setMessage({ type: 'error', text: '沒有可匯出的項目' });
      return;
    }

    // 只匯出已勾選的項目
    const selectedItems = missingKeys.filter((item) => selectedKeys[item.key]);
    if (selectedItems.length === 0) {
      setMessage({ type: 'error', text: '請至少勾選一個項目' });
      return;
    }

    setIsExporting(true);
    setMessage(null);

    try {
      const { SaveFile, WriteINIFile } = await import('../../wailsjs/go/main/App');
      
      // 讓用戶選擇儲存位置
      const savePath = await SaveFile('匯出為檔案', 'exported.ini');
      if (!savePath) {
        // 用戶取消
        setIsExporting(false);
        return;
      }

      // 準備要匯出的項目（使用參考檔案的 key 和值）
      const exportItems: INIKeyValue[] = selectedItems.map((item) => ({
        key: item.key,
        value: item.value
      }));

      await WriteINIFile(savePath, exportItems);
      setMessage({ type: 'success', text: `成功匯出 ${exportItems.length} 個項目到 ${savePath}` });
    } catch (e: any) {
      setMessage({ type: 'error', text: `匯出失敗：${e?.message || e}` });
    } finally {
      setIsExporting(false);
    }
  };

  // 虛擬滾動計算
  // 篩選結果（差異/缺失列表）
  const filteredDiffItems = useMemo(() => {
    if (compareMode === 'duplicateKeys') return [] as INIKeyValue[];
    const kw = resultSearchKeyword.trim().toLowerCase();
    if (!kw) return missingKeys;
    return missingKeys.filter((it) => {
      const keyHit = it.key.toLowerCase().includes(kw);
      const refValHit = (it.value || '').toLowerCase().includes(kw);
      const curVal = editedValues[it.key] || '';
      const curValHit = curVal.toLowerCase().includes(kw);
      return keyHit || refValHit || curValHit;
    });
  }, [compareMode, missingKeys, resultSearchKeyword, editedValues]);

  // 篩選結果（重複鍵列表）
  const filteredDuplicateRows = useMemo(() => {
    if (compareMode !== 'duplicateKeys') return [] as DuplicateRow[];
    const kw = resultSearchKeyword.trim().toLowerCase();
    if (!kw) return duplicateRows;
    return duplicateRows.filter((row) => {
      const keyHit = row.key.toLowerCase().includes(kw);
      const valHit = (row.value || '').toLowerCase().includes(kw);
      return keyHit || valHit;
    });
  }, [compareMode, duplicateRows, resultSearchKeyword]);

  const visibleRange = useMemo(() => {
    const buffer = 5; // 上下緩衝列數
    const actualStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const startIndex = Math.max(0, actualStart - buffer);
    const listLength = filteredDiffItems.length;
    const endIndex = Math.min(startIndex + VISIBLE_ROWS + buffer * 2, listLength);
    return { startIndex, endIndex, actualStart };
  }, [scrollTop, filteredDiffItems.length, VISIBLE_ROWS, ROW_HEIGHT, containerHeight]);

  const visibleItems = useMemo(() => {
    return filteredDiffItems.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [filteredDiffItems, visibleRange.startIndex, visibleRange.endIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const current = e.currentTarget;
    const nextTop = current.scrollTop;
    requestAnimationFrame(() => setScrollTop(nextTop));
  }, []);

  // 刪除重複列（依行數）
  const handleDeleteDuplicateLine = async (lineNumber: number) => {
    if (!currentFilePath) return;
    setDeletingLine(lineNumber);
    setMessage(null);
    try {
      const { ReadINIFile, WriteINIFile } = await import('../../wailsjs/go/main/App');
      const items = await ReadINIFile(currentFilePath) as INIKeyValue[];
      const newItems = (items || []).filter((_, idx) => idx !== (lineNumber - 1));
      await WriteINIFile(currentFilePath, newItems);
      setMessage({ type: 'success', text: `已刪除第 ${lineNumber} 行` });
      // 重新比對以刷新結果
      await handleCompare();
    } catch (e: any) {
      setMessage({ type: 'error', text: `刪除失敗：${e?.message || e}` });
    } finally {
      setDeletingLine(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 提示訊息 */}
      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 border ${
          message.type === 'success' ? 'text-green-400 bg-green-950/30 border-green-900/50' :
          message.type === 'error' ? 'text-red-400 bg-red-950/30 border-red-900/50' :
          'text-blue-400 bg-blue-950/30 border-blue-900/50'
        }`}>
          {message.text}
        </div>
      )}

      {/* 當前語系檔案 */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
        <h3 className="text-md font-bold text-orange-400 mb-2">當前語系檔案</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={currentFilePath}
            readOnly
            placeholder="尚未設定或找不到當前語系檔案..."
            className="flex-1 px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 font-mono"
          />
          <button
            onClick={async () => {
              try {
                const { SelectFile } = await import('../../wailsjs/go/main/App');
                const path = await SelectFile('選擇當前語系檔案 (global.ini)');
                if (path) {
                  setCurrentFilePath(path);
                  setMissingKeys([]);
                  setEditedValues({});
                  setSelectedKeys({});
                  setSelectAll(false);
                  setCompareStats(null);
                  setMessage(null);
                  setDuplicateRows([]);
                  setDeletingLine(null);
                }
              } catch (e) {
                console.error('選擇當前檔案失敗:', e);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition bg-gray-800 text-orange-300 border-orange-900/40 hover:bg-gray-700`}
          >
            選擇檔案
          </button>
        </div>
      </div>

      {/* 參考檔案選擇（重複鍵模式隱藏） */}
      {compareMode !== 'duplicateKeys' && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <h3 className="text-md font-bold text-orange-400 mb-2">參考檔案</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={referenceFilePath}
              readOnly
              placeholder="請選擇參考語系檔案..."
              className="flex-1 px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 font-mono"
            />
            <button
              onClick={handleSelectReference}
              disabled={!currentFilePath}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                !currentFilePath
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                  : 'bg-gray-800 text-orange-300 border-orange-900/40 hover:bg-gray-700'
              }`}
            >
              選擇檔案
            </button>
          </div>
        </div>
      )}

      {/* 比對選項與按鈕 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">比對模式：</span>
          <div className="inline-flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setCompareMode('missing')}
              className={`px-3 py-1.5 ${compareMode === 'missing' ? 'bg-orange-900/40 text-orange-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              只比對缺失鍵
            </button>
            <button
              onClick={() => setCompareMode('value')}
              className={`px-3 py-1.5 border-l border-gray-700 ${compareMode === 'value' ? 'bg-orange-900/40 text-orange-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              只比對不同值
            </button>
            <button
              onClick={() => setCompareMode('duplicateKeys')}
              className={`px-3 py-1.5 border-l border-gray-700 ${compareMode === 'duplicateKeys' ? 'bg-orange-900/40 text-orange-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              比對重複鍵
            </button>
            <button
              onClick={() => setCompareMode('searchValue')}
              className={`px-3 py-1.5 border-l border-gray-700 ${compareMode === 'searchValue' ? 'bg-orange-900/40 text-orange-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              比對指定值
            </button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {compareMode === 'searchValue' && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="輸入搜尋條件（值或 Key，模糊比對）"
              className="px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 w-64"
            />
          )}
          <button
            onClick={handleCompare}
            disabled={!currentFilePath || ((compareMode === 'missing' || compareMode === 'value' || compareMode === 'searchValue') && !referenceFilePath) || (compareMode === 'searchValue' && !searchQuery.trim()) || isComparing}
            className={`px-4 py-3 rounded-lg font-medium border transition ${
              (!currentFilePath || ((compareMode === 'missing' || compareMode === 'value' || compareMode === 'searchValue') && !referenceFilePath) || (compareMode === 'searchValue' && !searchQuery.trim()) || isComparing)
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 border-orange-900/50'
            }`}
          >
            {isComparing ? '比對中...' : '開始比對'}
          </button>
        </div>
      </div>

      {/* 統計資訊 */}
      {compareStats && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <h3 className="text-sm font-bold text-orange-400 mb-2">比對統計</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-black/40 border border-gray-700 rounded p-3">
              <div className="text-xs text-gray-400 mb-1">當前檔案項目數</div>
              <div className="text-xl font-bold text-blue-400">{compareStats.currentCount}</div>
            </div>
            {compareMode !== 'duplicateKeys' && (
              <div className="bg-black/40 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400 mb-1">參考檔案項目數</div>
                <div className="text-xl font-bold text-green-400">{compareStats.referenceCount}</div>
              </div>
            )}
            <div className="bg-black/40 border border-gray-700 rounded p-3">
              <div className="text-xs text-gray-400 mb-1">{
                compareMode === 'duplicateKeys' ? '重複列數' : (compareMode === 'value' ? '差異的項目數' : (compareMode === 'searchValue' ? '符合搜尋的項目數' : '缺少的項目數'))
              }</div>
              <div className="text-xl font-bold text-red-400">{compareMode === 'duplicateKeys' ? duplicateRows.length : missingKeys.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* 缺少/差異項目列表（重複鍵模式不顯示此段） */}
      {compareMode !== 'duplicateKeys' && missingKeys.length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-bold text-orange-400">
              {compareMode === 'value' ? '差異的項目' : compareMode === 'searchValue' ? '符合搜尋的項目' : '缺少的項目'} ({filteredDiffItems.filter(item => selectedKeys[item.key]).length}/{filteredDiffItems.length} 已選)
            </h3>
            <div className="flex gap-2">
              {compareMode !== 'searchValue' && (
                <input
                  type="text"
                  value={resultSearchKeyword}
                  onChange={(e) => setResultSearchKeyword(e.target.value)}
                  placeholder="在結果中搜尋 (Key/參考值/原檔值)"
                  className="px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 w-64"
                />
              )}
              <button
                onClick={handleSelectAll}
                className="px-3 py-2 rounded-lg text-sm font-medium border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              >
                {selectAll ? '取消全選' : '全選'}
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || missingKeys.filter(item => selectedKeys[item.key]).length === 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  (isExporting || missingKeys.filter(item => selectedKeys[item.key]).length === 0)
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600 border-blue-900/50'
                }`}
              >
                {isExporting ? '匯出中...' : '匯出為檔案'}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || missingKeys.filter(item => selectedKeys[item.key]).length === 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  (isSaving || missingKeys.filter(item => selectedKeys[item.key]).length === 0)
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                    : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 border-green-900/50'
                }`}
              >
                {isSaving ? '儲存中...' : '批次更新'}
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="overflow-y-auto overflow-x-auto"
            style={{ height: containerHeight }}
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 w-12">選取</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '25%' }}>Key</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '35%' }}>參考檔案的值</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '35%' }}>
                    {(compareMode === 'value' || compareMode === 'searchValue') ? '原檔案的值' : '新的值'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 上方間隔（維持捲動位置） */}
                {visibleRange.startIndex > 0 && (
                  <tr key="spacer-top">
                    <td colSpan={4} style={{ height: visibleRange.startIndex * ROW_HEIGHT }} />
                  </tr>
                )}
                {visibleItems.map((item, i) => (
                  // 真實索引
                  // const index = visibleRange.startIndex + i;
                  <tr key={`${item.key}-${visibleRange.startIndex + i}`} className="border-b border-gray-800 hover:bg-gray-900/30">
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedKeys[item.key] || false}
                        onChange={() => handleToggleSelect(item.key)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-xs text-orange-300 font-mono break-all">{item.key}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <textarea
                        value={item.value}
                        readOnly
                        rows={3}
                        className="w-full px-2 py-1 text-xs border rounded bg-gray-900/50 text-gray-400 border-gray-700 font-mono resize-none"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <textarea
                        value={editedValues[item.key] || ''}
                        onChange={(e) => setEditedValues({ ...editedValues, [item.key]: e.target.value })}
                        readOnly={false}
                        rows={3}
                        placeholder={(compareMode === 'value' || compareMode === 'searchValue') ? '可直接編輯原檔值...' : '輸入翻譯內容...'}
                        className={`w-full px-2 py-1 text-xs border rounded font-mono resize-y bg-black/50 text-gray-300 border-gray-600 focus:border-orange-500 focus:outline-none`}
                      />
                    </td>
                  </tr>
                ))}
                {/* 下方間隔 */}
                {visibleRange.endIndex < filteredDiffItems.length && (
                  <tr key="spacer-bottom">
                    <td colSpan={4} style={{ height: (filteredDiffItems.length - visibleRange.endIndex) * ROW_HEIGHT }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 重複鍵列表 */}
      {compareMode === 'duplicateKeys' && duplicateRows.length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-bold text-orange-400">重複鍵（所有出現列）</h3>
            <input
              type="text"
              value={resultSearchKeyword}
              onChange={(e) => setResultSearchKeyword(e.target.value)}
              placeholder="在結果中搜尋 (Key/值)"
              className="px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 w-20">行數</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '30%' }}>Key</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '45%' }}>值（唯讀）</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 w-28">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDuplicateRows.map((row, index) => (
                  <tr key={`${row.key}-${row.lineNumber}-${index}`} className="border-b border-gray-800 hover:bg-gray-900/30">
                    <td className="px-3 py-3 align-top text-xs text-gray-400">{row.lineNumber}</td>
                    <td className="px-3 py-3 align-top"><div className="text-xs text-orange-300 font-mono break-all">{row.key}</div></td>
                    <td className="px-3 py-3 align-top">
                      <textarea
                        value={row.value}
                        readOnly
                        rows={2}
                        className="w-full px-2 py-1 text-xs border rounded bg-gray-900/50 text-gray-400 border-gray-700 font-mono resize-none"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <button
                        onClick={() => setConfirmDeleteRow(row)}
                        disabled={deletingLine === row.lineNumber}
                        className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                          deletingLine === row.lineNumber
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                            : 'bg-red-900/30 text-red-300 border-red-900/50 hover:bg-red-900/40'
                        }`}
                      >
                        {deletingLine === row.lineNumber ? '刪除中...' : '刪除此列'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 確認刪除對話框 */}
      {confirmDeleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDeleteRow(null)} />
          <div className="relative bg-gradient-to-br from-gray-900 to-black text-gray-200 px-6 py-5 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-orange-900/50 w-full max-w-md">
            <h4 className="text-lg font-bold text-orange-400 mb-2">確認刪除</h4>
            <div className="text-sm text-gray-300 mb-4">
              確定要刪除第 <span className="text-orange-300 font-semibold">{confirmDeleteRow.lineNumber}</span> 行的紀錄嗎？
              <div className="mt-1 text-xs text-gray-400">Key：<span className="text-orange-300 font-mono">{confirmDeleteRow.key}</span></div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteRow(null)}
                className="px-4 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={() => { const ln = confirmDeleteRow.lineNumber; setConfirmDeleteRow(null); handleDeleteDuplicateLine(ln); }}
                className="px-4 py-2 text-sm rounded border bg-red-700/80 text-white border-red-900/60 hover:bg-red-700"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

