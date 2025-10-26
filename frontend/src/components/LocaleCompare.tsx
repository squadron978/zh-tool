import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';

// 定義 INI 鍵值對類型
interface INIKeyValue {
  key: string;
  value: string;
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
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasChineseLocale, setHasChineseLocale] = useState(false);
  const [compareStats, setCompareStats] = useState<{ currentCount: number; referenceCount: number } | null>(null);

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
      }
    } catch (e: any) {
      console.error('選擇檔案失敗:', e);
    }
  };

  // 執行比對
  const handleCompare = async () => {
    if (!currentFilePath || !referenceFilePath) {
      setMessage({ type: 'error', text: '請先選擇參考檔案' });
      return;
    }

    setIsComparing(true);
    setMessage(null);
    setCompareStats(null);

    try {
      const { ReadINIFile, CompareINIFiles } = await import('../../wailsjs/go/main/App');
      
      // 讀取兩個檔案的內容以獲取統計資訊
      const [currentItems, referenceItems, missing] = await Promise.all([
        ReadINIFile(currentFilePath),
        ReadINIFile(referenceFilePath),
        CompareINIFiles(currentFilePath, referenceFilePath)
      ]);

      // 設定統計資訊
      setCompareStats({
        currentCount: currentItems?.length || 0,
        referenceCount: referenceItems?.length || 0
      });

      if (missing && missing.length > 0) {
        setMissingKeys(missing);
        // 初始化編輯值為參考檔案的值
        const initialValues: { [key: string]: string } = {};
        const initialSelected: { [key: string]: boolean } = {};
        missing.forEach((item) => {
          initialValues[item.key] = item.value;
          initialSelected[item.key] = true; // 預設全選
        });
        setEditedValues(initialValues);
        setSelectedKeys(initialSelected);
        setSelectAll(true);
        setMessage({ type: 'info', text: `找到 ${missing.length} 個缺少的項目` });
      } else {
        setMissingKeys([]);
        setEditedValues({});
        setSelectedKeys({});
        setSelectAll(false);
        setMessage({ type: 'success', text: '沒有缺少的項目，兩個檔案完全一致！' });
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

  // 全選/取消全選
  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    const newSelected: { [key: string]: boolean } = {};
    missingKeys.forEach((item) => {
      newSelected[item.key] = newSelectAll;
    });
    setSelectedKeys(newSelected);
  };

  // 切換單個選擇
  const handleToggleSelect = (key: string) => {
    const newSelected = { ...selectedKeys, [key]: !selectedKeys[key] };
    setSelectedKeys(newSelected);
    // 檢查是否全選
    const allSelected = missingKeys.every((item) => newSelected[item.key]);
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
      const updates: INIKeyValue[] = selectedItems.map((item) => ({
        key: item.key,
        value: editedValues[item.key] || item.value
      }));

      await UpdateINIFile(currentFilePath, referenceFilePath, updates);
      setMessage({ type: 'success', text: `成功更新 ${updates.length} 個項目！` });
      
      // 移除已儲存的項目
      const remainingKeys = missingKeys.filter((item) => !selectedKeys[item.key]);
      setMissingKeys(remainingKeys);
      
      // 清理已儲存項目的狀態
      const newEditedValues = { ...editedValues };
      const newSelectedKeys = { ...selectedKeys };
      selectedItems.forEach((item) => {
        delete newEditedValues[item.key];
        delete newSelectedKeys[item.key];
      });
      setEditedValues(newEditedValues);
      setSelectedKeys(newSelectedKeys);
      
      if (remainingKeys.length === 0) {
        setSelectAll(false);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `儲存失敗：${e?.message || e}` });
    } finally {
      setIsSaving(false);
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
        <div className="text-xs text-gray-400 break-all font-mono bg-black/40 p-3 rounded border border-gray-700">
          {currentFilePath || '尚未設定或找不到當前語系檔案'}
        </div>
      </div>

      {/* 參考檔案選擇 */}
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

      {/* 比對按鈕 */}
      <div className="flex gap-2">
        <button
          onClick={handleCompare}
          disabled={!currentFilePath || !referenceFilePath || isComparing}
          className={`flex-1 px-4 py-3 rounded-lg font-medium border transition ${
            (!currentFilePath || !referenceFilePath || isComparing)
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
              : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 border-orange-900/50'
          }`}
        >
          {isComparing ? '比對中...' : '開始比對'}
        </button>
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
            <div className="bg-black/40 border border-gray-700 rounded p-3">
              <div className="text-xs text-gray-400 mb-1">參考檔案項目數</div>
              <div className="text-xl font-bold text-green-400">{compareStats.referenceCount}</div>
            </div>
            <div className="bg-black/40 border border-gray-700 rounded p-3">
              <div className="text-xs text-gray-400 mb-1">缺少的項目數</div>
              <div className="text-xl font-bold text-red-400">{missingKeys.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* 缺少的項目列表 */}
      {missingKeys.length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-bold text-orange-400">
              缺少的項目 ({missingKeys.filter(item => selectedKeys[item.key]).length}/{missingKeys.length} 已選)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-2 rounded-lg text-sm font-medium border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              >
                {selectAll ? '取消全選' : '全選'}
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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 w-12">選取</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '25%' }}>Key</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '35%' }}>參考檔案的值</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400" style={{ width: '35%' }}>新的值</th>
                </tr>
              </thead>
              <tbody>
                {missingKeys.map((item, index) => (
                  <tr key={index} className="border-b border-gray-800 hover:bg-gray-900/30">
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
                        rows={3}
                        placeholder="輸入翻譯內容..."
                        className="w-full px-2 py-1 text-xs border rounded bg-black/50 text-gray-300 border-gray-600 focus:border-orange-500 focus:outline-none font-mono resize-y"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

