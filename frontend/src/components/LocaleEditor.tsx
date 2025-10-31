import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import { useAppStore } from '../store/appStore';

// 定義 INI 鍵值對類型
interface INIKeyValue {
  key: string;
  value: string;
}

type SortField = 'key' | 'value' | 'none';
type SortOrder = 'asc' | 'desc';

// 表格行組件（使用 memo 優化）
const TableRow = memo(({ 
  index, 
  item, 
  value, 
  onValueChange 
}: { 
  index: number; 
  item: INIKeyValue; 
  value: string;
  onValueChange: (key: string, newValue: string) => void;
}) => {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-900/30">
      <td className="px-3 py-3 align-top text-xs text-gray-500">
        {index + 1}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="text-xs text-orange-300 font-mono break-all">{item.key}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <textarea
          value={value}
          onChange={(e) => onValueChange(item.key, e.target.value)}
          rows={2}
          className="w-full px-2 py-1 text-xs border rounded bg-black/50 text-gray-300 border-gray-600 focus:border-orange-500 focus:outline-none font-mono resize-y"
        />
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

export const LocaleEditor = () => {
  const { scPath, isPathValid } = useAppStore();
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [allItems, setAllItems] = useState<INIKeyValue[]>([]);
  const [editedValues, setEditedValues] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // 搜尋和排序狀態
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeSearchKeyword, setActiveSearchKeyword] = useState(''); // 實際執行搜尋的關鍵字
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  // 取代功能狀態
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceInSearchOnly, setReplaceInSearchOnly] = useState(true);
  
  // 資料是否已載入
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 虛擬滾動相關
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(450);
  const containerRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 80; // 每行大約高度
  
  // 計算可見行數
  const VISIBLE_ROWS = Math.ceil(containerHeight / ROW_HEIGHT);

  // 動態計算容器高度（根據容器頂部到視窗底部的距離）
  useEffect(() => {
    const calculateHeight = () => {
      const windowHeight = window.innerHeight;
      const el = containerRef.current;
      const top = el ? el.getBoundingClientRect().top : 200;
      const bottomPadding = 16; // 底部留白
      const newHeight = Math.max(260, Math.min(700, windowHeight - top - bottomPadding));
      setContainerHeight(newHeight);
    };

    // 初始計算
    calculateHeight();

    // 監聽視窗大小變化
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  // 檢查當前語系檔案路徑（不自動載入內容）
  useEffect(() => {
    const checkCurrentLocale = async () => {
      if (!isPathValid || !scPath) {
        setCurrentFilePath('');
        setAllItems([]);
        setIsDataLoaded(false);
        return;
      }

      try {
        const { GetCurrentLocaleINIPath } = await import('../../wailsjs/go/main/App');
        
        // 只獲取檔案路徑，不載入內容
        try {
          const currentPath = await GetCurrentLocaleINIPath(scPath);
          setCurrentFilePath(currentPath);
          setMessage({
            type: 'info',
            text: '請點擊「載入資料」按鈕開始編輯'
          });
        } catch (e: any) {
          setCurrentFilePath('');
          setAllItems([]);
          setIsDataLoaded(false);
          setMessage({
            type: 'info',
            text: '尚未設定語系，請先前往語系檔管理頁籤切換至任一語系。'
          });
        }
      } catch (e) {
        console.error('檢查語系檔案失敗:', e);
      }
    };

    void checkCurrentLocale();
  }, [scPath, isPathValid]);

  // 使用 useMemo 優化搜尋和排序處理，避免輸入時重新計算
  const displayItems = useMemo(() => {
    let filtered = [...allItems];

    // 模糊搜尋（使用 activeSearchKeyword）
    if (activeSearchKeyword.trim()) {
      const keyword = activeSearchKeyword.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.key.toLowerCase().includes(keyword) ||
          item.value.toLowerCase().includes(keyword)
      );
    }

    // 排序
    if (sortField !== 'none') {
      filtered.sort((a, b) => {
        const aVal = sortField === 'key' ? a.key : a.value;
        const bVal = sortField === 'key' ? b.key : b.value;
        
        const comparison = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [allItems, activeSearchKeyword, sortField, sortOrder]);

  // 虛擬滾動計算（加入防抖避免過度重新計算）
  const visibleRange = useMemo(() => {
    const buffer = 5; // 上下緩衝行數
    const actualStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const startIndex = Math.max(0, actualStart - buffer); // 上方緩衝
    const endIndex = Math.min(startIndex + VISIBLE_ROWS + buffer * 2, displayItems.length); // 下方緩衝
    return { startIndex, endIndex, actualStart };
  }, [scrollTop, displayItems.length, VISIBLE_ROWS, ROW_HEIGHT, containerHeight]);

  // 使用 useMemo 快取可見項目
  const visibleItems = useMemo(() => {
    return displayItems.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [displayItems, visibleRange.startIndex, visibleRange.endIndex]);

  // 滾動處理（使用節流避免過度更新）
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const current = e.currentTarget;
    const nextTop = current.scrollTop;
    requestAnimationFrame(() => setScrollTop(nextTop));
  }, []);

  // 切換排序
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 同一個欄位：切換順序或取消排序
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortField('none');
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // 執行取代
  const handleReplace = () => {
    if (!findText) {
      setMessage({ type: 'error', text: '請輸入要尋找的文字' });
      return;
    }

    const itemsToReplace = replaceInSearchOnly ? displayItems : allItems;
    let replacedCount = 0;

    const newEditedValues = { ...editedValues };
    itemsToReplace.forEach((item) => {
      const currentValue = newEditedValues[item.key];
      if (currentValue.includes(findText)) {
        newEditedValues[item.key] = currentValue.replaceAll(findText, replaceText);
        replacedCount++;
      }
    });

    setEditedValues(newEditedValues);
    setMessage({ 
      type: 'success', 
      text: `已取代 ${replacedCount} 個項目${replaceInSearchOnly ? '（限搜尋結果）' : '（所有項目）'}` 
    });
  };

  // 儲存檔案
  const handleSave = async () => {
    if (!currentFilePath || allItems.length === 0) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      // 準備要儲存的項目（使用編輯後的值）
      const updates: INIKeyValue[] = allItems.map((item) => ({
        key: item.key,
        value: editedValues[item.key] || item.value
      }));

      // 直接寫入檔案
      const content = updates.map((item) => `${item.key}=${item.value}`).join('\n') + '\n';
      
      // 使用原生方法寫入
      const { WriteINIFile } = await import('../../wailsjs/go/main/App');
      await WriteINIFile(currentFilePath, updates);
      
      setMessage({ type: 'success', text: '儲存成功！' });
      
      // 更新 allItems 為新的值
      setAllItems(updates);
    } catch (e: any) {
      setMessage({ type: 'error', text: `儲存失敗：${e?.message || e}` });
    } finally {
      setIsSaving(false);
    }
  };

  // 載入資料
  const handleLoadData = async () => {
    if (!currentFilePath) {
      setMessage({ type: 'error', text: '找不到語系檔案路徑' });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    
    try {
      const { ReadINIFile } = await import('../../wailsjs/go/main/App');
      const items = await ReadINIFile(currentFilePath);
      setAllItems(items || []);
      
      // 初始化編輯值
      const initialValues: { [key: string]: string } = {};
      (items || []).forEach((item) => {
        initialValues[item.key] = item.value;
      });
      setEditedValues(initialValues);
      
      // 清除搜尋
      setSearchKeyword('');
      setActiveSearchKeyword('');
      
      setIsDataLoaded(true);
      setMessage({ type: 'success', text: `已載入 ${items?.length || 0} 個項目` });
    } catch (e: any) {
      setMessage({ type: 'error', text: `載入失敗：${e?.message || e}` });
      setIsDataLoaded(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 執行搜尋
  const handleSearch = () => {
    setActiveSearchKeyword(searchKeyword);
    // 捲動至頂端，避免使用者停留在很底部
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
    if (searchKeyword.trim()) {
      setMessage({ type: 'info', text: `搜尋關鍵字：${searchKeyword}` });
    } else {
      setMessage({ type: 'info', text: '已清除搜尋條件' });
    }
  };

  // 清除搜尋
  const handleClearSearch = () => {
    setSearchKeyword('');
    setActiveSearchKeyword('');
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
    setMessage({ type: 'info', text: '已清除搜尋' });
  };

    // 使用 useCallback 優化事件處理函數，避免每次渲染都創建新函數
  const handleValueChange = useCallback((key: string, newValue: string) => {
    setEditedValues(prev => {
      // 只有在值真的改變時才更新
      if (prev[key] === newValue) return prev;
      return { ...prev, [key]: newValue };
    });
  }, []);

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

      {/* 當前檔案資訊 */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-md font-bold text-orange-400">當前語系檔案</h3>
          {currentFilePath && (
            <button
              onClick={handleLoadData}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg font-medium border transition ${
                isLoading
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                  : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 border-orange-900/50'
              }`}
            >
              {isLoading ? '載入中...' : isDataLoaded ? '🔄 重新載入' : '📂 載入資料'}
            </button>
          )}
        </div>
        <div className="flex gap-2 mb-3">
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
                const path = await SelectFile('選擇語系檔案 (global.ini)');
                if (path) {
                  setCurrentFilePath(path);
                  setAllItems([]);
                  setEditedValues({});
                  setIsDataLoaded(false);
                  setSearchKeyword('');
                  setActiveSearchKeyword('');
                  setSortField('none');
                  setSortOrder('asc');
                  setShowReplacePanel(false);
                  setMessage({ type: 'info', text: '請點擊「載入資料」按鈕開始編輯' });
                }
              } catch (e) {
                console.error('選擇語系檔案失敗:', e);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition bg-gray-800 text-orange-300 border-orange-900/40 hover:bg-gray-700`}
          >
            選擇檔案
          </button>
        </div>
        {currentFilePath && isDataLoaded && (
          <div className="flex gap-2 text-xs text-gray-400">
            <span>總項目數：<span className="text-orange-300 font-bold">{allItems.length}</span></span>
            <span>|</span>
            <span>顯示項目數：<span className="text-blue-300 font-bold">{displayItems.length}</span></span>
          </div>
        )}
      </div>

      {/* 工具列 */}
      {currentFilePath && isDataLoaded && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 搜尋 */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">模糊搜尋</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  placeholder="搜尋 Key 或 Value..."
                  className="flex-1 px-3 py-2 text-sm border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 text-sm rounded border bg-orange-600 text-white border-orange-500 hover:bg-orange-500"
                >
                  🔍 搜尋
                </button>
                {activeSearchKeyword && (
                  <button
                    onClick={handleClearSearch}
                    className="px-3 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* 排序 */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">排序</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSort('key')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    sortField === 'key'
                      ? 'bg-orange-600 text-white border-orange-500'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  Key {sortField === 'key' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('value')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    sortField === 'value'
                      ? 'bg-orange-600 text-white border-orange-500'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  Value {sortField === 'value' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => setShowReplacePanel(!showReplacePanel)}
                  className="px-3 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                >
                  取代
                </button>
              </div>
            </div>
          </div>

          {/* 取代面板 */}
          {showReplacePanel && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-bold text-orange-400 mb-3">批次取代</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">尋找文字</label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder="要尋找的文字..."
                    className="w-full px-3 py-2 text-sm border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">取代為</label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="取代後的文字..."
                    className="w-full px-3 py-2 text-sm border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceInSearchOnly}
                    onChange={(e) => setReplaceInSearchOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500"
                  />
                  只取代搜尋結果
                </label>
                <button
                  onClick={handleReplace}
                  disabled={!findText}
                  className={`px-4 py-2 text-sm rounded border transition ${
                    !findText
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                      : 'bg-orange-600 text-white border-orange-500 hover:bg-orange-500'
                  }`}
                >
                  執行取代
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作按鈕 */}
      {currentFilePath && isDataLoaded && (
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className={`flex-1 px-4 py-3 rounded-lg font-medium border transition ${
              (isSaving || isLoading)
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 border-green-900/50'
            }`}
          >
            {isSaving ? '儲存中...' : '💾 儲存變更'}
          </button>
        </div>
      )}

      {/* 編輯表格 */}
      {currentFilePath && isDataLoaded && displayItems.length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div 
            className="overflow-x-auto overflow-y-auto" 
            style={{ height: `${containerHeight}px` }}
            ref={containerRef}
            onScroll={handleScroll}
          >
            <div style={{ height: `${displayItems.length * ROW_HEIGHT}px`, position: 'relative' }}>
              {/* 上方佔位 */}
              <div style={{ height: `${visibleRange.startIndex * ROW_HEIGHT}px` }} />
              
              {/* 可見內容 */}
              <div style={{ position: 'relative' }}>
                <table className="w-full border-collapse" style={{ position: 'relative' }}>
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr className="border-b border-gray-700">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 w-8">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '30%' }}>
                        Key
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '70%' }}>
                        Value
                      </th>
                    </tr>
                  </thead>
                <tbody style={{ height: `${visibleRange.endIndex * ROW_HEIGHT - visibleRange.startIndex * ROW_HEIGHT}px` }}>
                  {visibleItems.map((item, idx) => {
                    const actualIndex = visibleRange.startIndex + idx;
                    return (
                      <TableRow
                        key={item.key}
                        index={actualIndex}
                        item={item}
                        value={editedValues[item.key] || ''}
                        onValueChange={handleValueChange}
                      />
                    );
                  })}
                </tbody>
                </table>
              </div>
              
              {/* 下方佔位 */}
              {visibleRange.endIndex < displayItems.length && (
                <div style={{ height: `${(displayItems.length - visibleRange.endIndex) * ROW_HEIGHT}px` }} />
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400 text-center">
            顯示 {visibleRange.startIndex + 1} - {Math.min(visibleRange.endIndex, displayItems.length)} / 共 {displayItems.length} 項
          </div>
        </div>
      )}

      {/* 載入中 */}
      {isLoading && (
        <div className="text-center text-gray-400 py-8">
          <div className="text-lg">載入中...</div>
        </div>
      )}

      {/* 無資料 */}
      {!currentFilePath && !isLoading && (
        <div className="text-center text-gray-400 py-8">
          <div className="text-lg mb-2">📝</div>
          <div>請先設定語系檔案</div>
        </div>
      )}

      {/* 已有檔案但未載入資料 */}
      {currentFilePath && !isDataLoaded && !isLoading && (
        <div className="text-center text-gray-400 py-8">
          <div className="text-lg mb-2">📂</div>
          <div>點擊上方「載入資料」按鈕開始編輯</div>
        </div>
      )}

      {/* 已載入但無搜尋結果 */}
      {currentFilePath && isDataLoaded && displayItems.length === 0 && !isLoading && (
        <div className="text-center text-gray-400 py-8">
          <div className="text-lg mb-2">🔍</div>
          <div>沒有符合搜尋條件的項目</div>
          {activeSearchKeyword && (
            <button
              onClick={handleClearSearch}
              className="mt-3 px-4 py-2 text-sm rounded border bg-gray-800 text-orange-300 border-gray-700 hover:bg-gray-700"
            >
              清除搜尋
            </button>
          )}
        </div>
      )}
    </div>
  );
};

