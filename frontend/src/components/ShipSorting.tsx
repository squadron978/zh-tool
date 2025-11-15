import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';

interface INIKeyValue {
  key: string;
  value: string;
}

interface VehicleGroup {
  baseKey: string; // 去除 _short 的 key 基底
  longKey: string | null; // 原始完整名稱 key（沒有 _short）
  shortKey: string | null; // 簡寫 key（含 _short）
  longValue: string | null; // 原始值（未加前綴）
  shortValue: string | null; // 原始值（未加前綴）
}

const NUM_PREFIX_REGEX = /^(\d{3})\s+/;

const stripPrefix = (text: string): { text: string; num: number | null } => {
  const m = text.match(NUM_PREFIX_REGEX);
  if (!m) return { text, num: null };
  const t = text.replace(NUM_PREFIX_REGEX, '');
  return { text: t, num: parseInt(m[1], 10) };
};

const pad3 = (n: number) => n.toString().padStart(3, '0');

export const ShipSorting = () => {
  const { setCurrentPage, scPath, isPathValid, setScPath, setIsPathValid } = useAppStore();

  const [currentFilePath, setCurrentFilePath] = useState('');
  const [currentLocale, setCurrentLocale] = useState('');
  const [allItems, setAllItems] = useState<INIKeyValue[]>([]);
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [sortedBaseKeys, setSortedBaseKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [tab, setTab] = useState<'sort' | 'profiles'>('sort');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [isBusyProfiles, setIsBusyProfiles] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);

  // 進入頁面時若尚未設定路徑，嘗試自動偵測並驗證
  useEffect(() => {
    const detectIfNeeded = async () => {
      if (scPath) return;
      try {
        const { DetectStarCitizenPath, ValidateStarCitizenPath } = await import('../../wailsjs/go/main/App');
        const detected = await DetectStarCitizenPath();
        if (detected) {
          setScPath(detected);
          const valid = await ValidateStarCitizenPath(detected);
          setIsPathValid(valid);
        }
      } catch (e) {
        // 忽略偵測錯誤，維持原狀態
      }
    };
    void detectIfNeeded();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 讀取當前語系檔案並建立載具群組
  useEffect(() => {
    const init = async () => {
      if (!isPathValid || !scPath) {
        setCurrentFilePath('');
        setAllItems([]);
        setGroups([]);
        setSortedBaseKeys([]);
        setMessage({ type: 'info', text: '尚未設定語系，請先前往語系管理安裝並選擇語系。' });
        return;
      }

      setIsLoading(true);
      setMessage(null);
      try {
        const { GetUserLanguage, GetCurrentLocaleINIPath, ReadINIFile } = await import('../../wailsjs/go/main/App');
        // 確保 Sort 目錄存在
        try {
          const app: any = await import('../../wailsjs/go/main/App');
          await app.EnsureSortDirs(scPath);
        } catch {}
        const localeName = await GetUserLanguage(scPath);
        if (!localeName) {
          setCurrentLocale('');
          setCurrentFilePath('');
          setAllItems([]);
          setGroups([]);
          setSortedBaseKeys([]);
          setMessage({ type: 'info', text: '尚未設定語系，請先前往語系檔管理頁籤切換至任一語系。' });
          setIsLoading(false);
          return;
        }
        setCurrentLocale(localeName);

        const iniPath = await GetCurrentLocaleINIPath(scPath);
        setCurrentFilePath(iniPath);
        const items = await ReadINIFile(iniPath) as INIKeyValue[];
        setAllItems(items);

        // 只抓取 key 內含 vehicle_Name 的項目，並依 _short 合併為同一載具
        const vehicleItems = (items || []).filter(it => it.key.toLowerCase().includes('vehicle_name'));
        const baseMap = new Map<string, VehicleGroup>();
        vehicleItems.forEach(it => {
          const kl = it.key.toLowerCase();
          let isShort = false;
          let baseKey: string;
          if (kl.endsWith('_short,p')) {
            isShort = true;
            baseKey = it.key.slice(0, -('_short,p'.length)) + ',P';
          } else if (kl.endsWith('_short')) {
            isShort = true;
            baseKey = it.key.slice(0, -('_short'.length));
          } else {
            baseKey = it.key;
          }
          const { text: valNoNum, num } = stripPrefix(it.value);
          const g = baseMap.get(baseKey) || {
            baseKey,
            longKey: null,
            shortKey: null,
            longValue: null,
            shortValue: null,
          } as VehicleGroup;
          if (isShort) {
            g.shortKey = it.key;
            g.shortValue = valNoNum;
          } else {
            g.longKey = it.key;
            g.longValue = valNoNum;
          }
          baseMap.set(baseKey, g);
        });

        const groupList = Array.from(baseMap.values());
        setGroups(groupList);

        // 優先以 active.json（若存在）決定排序，否則退回前綴偵測
        try {
          const app: any = await import('../../wailsjs/go/main/App');
          const activeKeys: string[] = await app.GetActiveVehicleOrder(scPath);
          if (Array.isArray(activeKeys) && activeKeys.length > 0) {
            const exist = new Set(groupList.map(g => g.baseKey));
            const filtered = activeKeys.filter((k) => exist.has(k));
            if (filtered.length > 0) {
              setSortedBaseKeys(filtered);
            } else {
              // fallback to prefix
              const detected = groupList
                .map(g => {
                  const origRaw = (vehicleItems.find(v => v.key === (g.longKey || g.shortKey))?.value) || '';
                  const m = origRaw.match(NUM_PREFIX_REGEX);
                  return { baseKey: g.baseKey, num: m ? parseInt(m[1], 10) : null };
                })
                .filter(x => x.num != null)
                .sort((a, b) => (a.num! - b.num!))
                .map(x => x.baseKey);
              setSortedBaseKeys(detected);
            }
          } else {
            const detected = groupList
              .map(g => {
                const origRaw = (vehicleItems.find(v => v.key === (g.longKey || g.shortKey))?.value) || '';
                const m = origRaw.match(NUM_PREFIX_REGEX);
                return { baseKey: g.baseKey, num: m ? parseInt(m[1], 10) : null };
              })
              .filter(x => x.num != null)
              .sort((a, b) => (a.num! - b.num!))
              .map(x => x.baseKey);
            setSortedBaseKeys(detected);
          }
        } catch {
          const detected = groupList
            .map(g => {
              const origRaw = (vehicleItems.find(v => v.key === (g.longKey || g.shortKey))?.value) || '';
              const m = origRaw.match(NUM_PREFIX_REGEX);
              return { baseKey: g.baseKey, num: m ? parseInt(m[1], 10) : null };
            })
            .filter(x => x.num != null)
            .sort((a, b) => (a.num! - b.num!))
            .map(x => x.baseKey);
          setSortedBaseKeys(detected);
        }
        setMessage({ type: 'success', text: `已載入 ${groupList.length} 個載具名稱` });
      } catch (e: any) {
        setMessage({ type: 'error', text: `載入失敗：${e?.message || e}` });
        setCurrentFilePath('');
        setAllItems([]);
        setGroups([]);
        setSortedBaseKeys([]);
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, [scPath, isPathValid]);

  // 讀取 save 清單
  const refreshSavedNames = async () => {
    if (!isPathValid || !scPath) { setSavedNames([]); return; }
    try {
      const app: any = await import('../../wailsjs/go/main/App');
      const names = await app.ListVehicleOrderSaves(scPath);
      setSavedNames(Array.isArray(names) ? names : []);
    } catch { setSavedNames([]); }
  };
  useEffect(() => { void refreshSavedNames(); }, [scPath, isPathValid]);

  // 衍生：未排序與已排序
  const groupedByBase = useMemo(() => {
    const map = new Map(groups.map(g => [g.baseKey, g] as const));
    return map;
  }, [groups]);

  const sortedGroups = useMemo(() => sortedBaseKeys.map(k => groupedByBase.get(k)!).filter(Boolean), [sortedBaseKeys, groupedByBase]);

  const unsortedGroups = useMemo(() => {
    const s = new Set(sortedBaseKeys);
    return groups.filter(g => !s.has(g.baseKey));
  }, [groups, sortedBaseKeys]);

  // 未排序模糊搜尋
  const [unsortedQuery, setUnsortedQuery] = useState('');
  const unsortedFiltered = useMemo(() => {
    const q = unsortedQuery.trim().toLowerCase();
    if (!q) return unsortedGroups;
    return unsortedGroups.filter(g => {
      const name = (g.longValue ?? g.shortValue ?? '').toLowerCase();
      const k1 = (g.longKey || '').toLowerCase();
      const k2 = (g.shortKey || '').toLowerCase();
      return name.includes(q) || k1.includes(q) || k2.includes(q) || g.baseKey.toLowerCase().includes(q);
    });
  }, [unsortedGroups, unsortedQuery]);

  const displayName = (g: VehicleGroup) => (g.longValue ?? g.shortValue ?? '');

  const handleAddToSorted = (baseKey: string) => {
    if (sortedBaseKeys.includes(baseKey)) return;
    setSortedBaseKeys(prev => [baseKey, ...prev]);
  };

  const handleRemoveFromSorted = (baseKey: string) => {
    setSortedBaseKeys(prev => prev.filter(k => k !== baseKey));
  };

  // 拖曳排序
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const onDragStart = (idx: number) => setDragIndex(idx);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDrop = (idx: number) => {
    if (dragIndex == null || dragIndex === idx) return;
    setSortedBaseKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  // 儲存：依已排序清單加上 001 前綴，其餘移除前綴
  const handleSave = async () => {
    if (!currentFilePath || allItems.length === 0) return;
    setIsSaving(true);
    setMessage(null);
    try {
      // 建立 baseKey -> prefixNumber（1-based）
      const orderMap = new Map<string, number>();
      sortedBaseKeys.forEach((k, i) => orderMap.set(k, i + 1));

      // 快取 baseKey 查找
      const toBase = (key: string) => {
        const kl = key.toLowerCase();
        if (kl.endsWith('_short,p')) return key.slice(0, -('_short,p'.length)) + ',P';
        if (kl.endsWith('_short')) return key.slice(0, -('_short'.length));
        return key;
      };

      // 先保存 active.json
      const app: any = await import('../../wailsjs/go/main/App');
      try { await app.SaveVehicleOrderActive(scPath, sortedBaseKeys); } catch {}
      
      // 使用後端的 ApplyActiveVehicleOrderToLocale 來確保語系檔正確更新
      // 這樣可以確保邏輯與自動安裝流程一致
      let localeFileUpdated = false;
      try {
        await app.ApplyActiveVehicleOrderToLocale(scPath, currentLocale);
        // 重新讀取語系檔以更新顯示
        const { ReadINIFile } = await import('../../wailsjs/go/main/App');
        const updatedItems = await ReadINIFile(currentFilePath);
        setAllItems(updatedItems);
        localeFileUpdated = true;
      } catch (e: any) {
        // 如果後端方法失敗，回退到前端直接寫入的方式
        const newItems: INIKeyValue[] = allItems.map(it => {
          if (!it.key.toLowerCase().includes('vehicle_name')) return it;
          const baseKey = toBase(it.key);
          const { text: noNum } = stripPrefix(it.value);
          const ord = orderMap.get(baseKey);
          if (ord != null) {
            return { key: it.key, value: `${pad3(ord)} ${noNum}` };
          }
          // 未排序：移除前綴
          return { key: it.key, value: noNum };
        });

        const { WriteINIFile } = await import('../../wailsjs/go/main/App');
        await WriteINIFile(currentFilePath, newItems);
        setAllItems(newItems);
        localeFileUpdated = true;
      }
      
      // 如果語系檔更新成功，且當前編輯的語系是遊戲中正在使用的語系，自動套用到遊戲資料夾
      if (localeFileUpdated && currentLocale && scPath && isPathValid) {
        try {
          const currentUserLanguage = await app.GetUserLanguage(scPath);
          if (currentUserLanguage === currentLocale) {
            setMessage({ type: 'info', text: '已儲存排序至語系檔。正在套用到遊戲資料夾...' });
            await app.ApplyLocalLocaleToGame(scPath, currentLocale);
            setMessage({ type: 'success', text: '已儲存排序並套用到遊戲資料夾。' });
          } else {
            setMessage({ type: 'success', text: '已儲存排序至語系檔。' });
          }
        } catch (e: any) {
          // 如果套用失敗，仍然顯示儲存成功，但提示需要重新安裝
          setMessage({ type: 'success', text: '已儲存排序至語系檔。請重新執行自動安裝以套用排序到遊戲。' });
        }
      } else if (localeFileUpdated) {
        setMessage({ type: 'success', text: '已儲存排序至語系檔。' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `儲存失敗：${e?.message || e}` });
    } finally {
      setIsSaving(false);
    }
  };

  // 另存新檔（存入 Sort/save）
  const handleSaveAs = async () => {
    const name = saveAsName.trim();
    if (!name) return;
    setIsBusyProfiles(true);
    setMessage(null);
    try {
      const app: any = await import('../../wailsjs/go/main/App');
      await app.SaveVehicleOrderAs(scPath, name, sortedBaseKeys);
      setSaveAsOpen(false);
      setSaveAsName('');
      await refreshSavedNames();
      setMessage({ type: 'success', text: `已另存為 ${name}.json` });
    } catch (e: any) {
      setMessage({ type: 'error', text: `另存失敗：${e?.message || e}` });
    } finally {
      setIsBusyProfiles(false);
    }
  };

  // 下載文字檔（JSON）
  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // 開啟檔案選擇並讀取文字
  const pickAndReadTextFile = (accept: string, onLoaded: (text: string, filename: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (file) {
        const text = await file.text();
        onLoaded(text, file.name);
      }
      input.remove();
    };
    input.click();
  };

  // 匯出為 JSON 檔（使用系統儲存對話框）
  const handleExportFile = async () => {
    const data = { type: 'vehicle_order', version: 1, baseKeys: sortedBaseKeys };
    const json = JSON.stringify(data, null, 2);
    const now = new Date();
    const ts = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
    try {
      const app: any = await import('../../wailsjs/go/main/App');
      const savedPath = await app.SaveTextFile('匯出載具排序', `vehicle_order_${ts}.json`, json);
      if (!savedPath) {
        setMessage({ type: 'info', text: '已取消匯出。' });
        return;
      }
      setMessage({ type: 'success', text: `已儲存至：${savedPath}` });
    } catch (e: any) {
      setMessage({ type: 'error', text: `匯出失敗：${e?.message || e}` });
    }
  };

  // 從 JSON 檔匯入
  const handleImportFile = () => {
    pickAndReadTextFile('.json,application/json', (txt) => {
      try {
        const data = JSON.parse(txt);
        if (!data || data.type !== 'vehicle_order' || !Array.isArray(data.baseKeys)) {
          setMessage({ type: 'error', text: '檔案內容不是有效的排序清單 JSON。' });
          return;
        }
        const exist = new Set(groups.map(g => g.baseKey));
        const list: string[] = (data.baseKeys as string[]).filter(k => exist.has(k));
        setSortedBaseKeys(list);
        setMessage({ type: 'success', text: '已從檔案匯入排序清單。' });
      } catch (e: any) {
        setMessage({ type: 'error', text: '匯入失敗：檔案無法解析為 JSON。' });
      }
    });
  };

  return (
    <div className="w-full bg-gradient-to-br from-gray-900 to-black border border-orange-900/50 rounded-xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-orange-400">載具排序</h2>
        <button
          onClick={() => setCurrentPage('home')}
          className="px-4 py-2 text-sm bg-gray-800 text-orange-300 rounded-lg border border-orange-900/50 hover:bg-gray-700"
        >
          ← 返回首頁
        </button>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 border mb-4 ${
          message.type === 'success' ? 'text-green-400 bg-green-950/30 border-green-900/50' :
          message.type === 'error' ? 'text-red-400 bg-red-950/30 border-red-900/50' :
          'text-blue-400 bg-blue-950/30 border-blue-900/50'
        }`}>
          {message.text}
        </div>
      )}

      {/* 當前檔案資訊與動作 */
      }
      <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">當前語系檔案</div>
            <input
              type="text"
              value={currentFilePath}
              readOnly
              placeholder="尚未設定或找不到當前語系檔案..."
              className="w-full px-3 py-2 text-xs border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 font-mono"
            />
            {currentLocale && (
              <div className="mt-1 text-xs text-gray-400">當前語系：<span className="text-orange-300 font-semibold">{currentLocale}</span></div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading || !currentFilePath}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                (isSaving || isLoading || !currentFilePath)
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                  : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 border-green-900/50'
              }`}
            >
              {isSaving ? '應用中...' : '應用排序'}
            </button>
          </div>
        </div>
      </div>

      {/* 子頁籤 */}
      <div className="mb-3 flex items-center gap-2 border-b border-orange-900/40">
        <button onClick={() => setTab('sort')} className={`px-3 py-2 text-sm rounded-t ${tab==='sort'?'bg-orange-900/30 text-orange-300':'text-gray-300 hover:text-white'}`}>排序</button>
        <button onClick={() => setTab('profiles')} className={`px-3 py-2 text-sm rounded-t ${tab==='profiles'?'bg-orange-900/30 text-orange-300':'text-gray-300 hover:text-white'}`}>設定檔管理</button>
      </div>

      {tab === 'sort' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 未排序 */}
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2 gap-3">
            <h3 className="text-md font-bold text-gray-200">未排序</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setUnsortedQuery('PYAM')}
                  className="px-2 py-1 text-[11px] rounded border bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                  title="快速套用搜尋：PYAM"
                >
                  焰火
                </button>
                <button
                  onClick={() => setUnsortedQuery('Collector')}
                  className="px-2 py-1 text-[11px] rounded border bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                  title="快速套用搜尋：Collector"
                >
                  維科洛
                </button>
              </div>
              <input
                type="text"
                value={unsortedQuery}
                onChange={(e) => setUnsortedQuery(e.target.value)}
                placeholder="模糊搜尋名稱或 key..."
                className="px-2 py-1 text-xs border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none w-56"
              />
              <div className="text-xs text-gray-500 text-right w-20">{unsortedFiltered.length}/{unsortedGroups.length}</div>
            </div>
          </div>
          <div className="max-h-[490px] overflow-auto divide-y divide-gray-800">
            {unsortedFiltered.map(g => (
              <button
                key={g.baseKey}
                onClick={() => handleAddToSorted(g.baseKey)}
                className="w-full text-left px-3 py-2 hover:bg-gray-900/50 transition text-sm"
                title="點擊加入已排序"
              >
                <div className="text-orange-300">{displayName(g)}</div>
                <div className="text-[10px] text-gray-500 font-mono break-all">{g.longKey || g.shortKey}</div>
              </button>
            ))}
            {unsortedFiltered.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-6">無項目</div>
            )}
          </div>
        </div>

        {/* 已排序（可拖曳） */}
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-md font-bold text-gray-200">已排序</h3>
            <div className="text-xs text-gray-500">{sortedGroups.length} 項</div>
          </div>
          <div className="max-h-[490px] overflow-auto divide-y divide-gray-800">
            {sortedGroups.map((g, idx) => (
              <div
                key={g.baseKey}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-900/50 transition text-sm select-none"
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(idx)}
              >
                <div className="w-12 shrink-0 text-orange-400 font-mono">{pad3(idx + 1)}</div>
                <div className="flex-1">
                  <div className="text-orange-300">{displayName(g)}</div>
                  <div className="text-[10px] text-gray-500 font-mono break-all">{g.longKey || g.shortKey}</div>
                </div>
                <button
                  onClick={() => handleRemoveFromSorted(g.baseKey)}
                  className="px-2 py-1 text-xs rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                >
                  移除
                </button>
              </div>
            ))}
            {sortedGroups.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-6">尚未選擇項目</div>
            )}
          </div>
        </div>
      </div>
      )}

      {tab === 'profiles' && (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-bold text-orange-400">設定檔管理</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSaveAsOpen(true)}
                disabled={isBusyProfiles || !isPathValid || sortedBaseKeys.length === 0}
                className={`px-3 py-2 text-sm rounded border ${
                  (isBusyProfiles || !isPathValid || sortedBaseKeys.length === 0)
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                    : 'bg-orange-600 text-white border-orange-500 hover:bg-orange-500'
                }`}
              >
                另存新檔
              </button>
              <button
                onClick={async () => {
                  setIsBusyProfiles(true);
                  try {
                    const app: any = await import('../../wailsjs/go/main/App');
                    const path = await app.SelectJSONFile('選擇載具排序 JSON 檔');
                    if (path) {
                      await app.ImportVehicleOrderFile(scPath, path);
                      await refreshSavedNames();
                      setMessage({ type: 'success', text: '已匯入至 save 資料夾' });
                    }
                  } catch (e: any) {
                    setMessage({ type: 'error', text: `匯入失敗：${e?.message || e}` });
                  } finally { setIsBusyProfiles(false); }
                }}
                disabled={isBusyProfiles || !isPathValid}
                className={`px-3 py-2 text-sm rounded border ${
                  (isBusyProfiles || !isPathValid) ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
              >
                匯入設定檔
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">檔名</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {savedNames.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-sm text-gray-500">尚無已儲存的設定檔</td></tr>
                )}
                {savedNames.map((name) => (
                  <tr key={name} className="border-b border-gray-800 hover:bg-gray-900/30">
                    <td className="px-3 py-3 text-sm text-gray-300 font-mono">{name}.json</td>
                    <td className="px-3 py-3 text-center flex items-center gap-2 justify-center">
                      <button
                        onClick={async () => {
                          setIsBusyProfiles(true);
                          try {
                            const app: any = await import('../../wailsjs/go/main/App');
                            const baseKeys: string[] = await app.SetActiveVehicleOrderByName(scPath, name);
                            // 套用到目前排序清單（過濾不存在的 baseKey）
                            const exist = new Set(groups.map(g => g.baseKey));
                            const filtered = (baseKeys || []).filter(k => exist.has(k));
                            setSortedBaseKeys(filtered);
                            setMessage({ type: 'success', text: `已套用設定檔：${name}.json` });
                          } catch (e: any) {
                            setMessage({ type: 'error', text: `套用失敗：${e?.message || e}` });
                          } finally { setIsBusyProfiles(false); }
                        }}
                        disabled={isBusyProfiles}
                        className={`px-3 py-1 rounded border text-xs ${isBusyProfiles ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-orange-600 text-white border-orange-500 hover:bg-orange-500'}`}
                      >
                        套用
                      </button>
                      <button
                        onClick={async () => {
                          setIsBusyProfiles(true);
                          try {
                            const app: any = await import('../../wailsjs/go/main/App');
                            const dest = await app.SaveFile('匯出設定檔', `${name}.json`);
                            if (dest) {
                              await app.ExportVehicleOrderFile(scPath, name, dest);
                              setMessage({ type: 'success', text: `已匯出至：${dest}` });
                            }
                          } catch (e: any) {
                            setMessage({ type: 'error', text: `匯出失敗：${e?.message || e}` });
                          } finally { setIsBusyProfiles(false); }
                        }}
                        disabled={isBusyProfiles}
                        className={`px-3 py-1 rounded border text-xs ${isBusyProfiles ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-gray-800 text-gray-300 border-orange-900/40 hover:bg-gray-700'}`}
                      >
                        匯出
                      </button>
                      <button
                        onClick={() => setConfirmDeleteName(name)}
                        disabled={isBusyProfiles}
                        className={`px-3 py-1 rounded border text-xs ${isBusyProfiles ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-red-900/30 text-red-300 border-red-900/50 hover:bg-red-900/40'}`}
                      >
                        刪除
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
      {confirmDeleteName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDeleteName(null)} />
          <div className="relative bg-gradient-to-br from-gray-900 to-black text-gray-200 px-6 py-5 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-orange-900/50 w-full max-w-md">
            <h4 className="text-lg font-bold text-orange-400 mb-2">確認刪除</h4>
            <div className="text-sm text-gray-300 mb-3">確定要刪除設定檔 <span className="text-orange-300 font-mono">{confirmDeleteName}.json</span> 嗎？</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteName(null)} className="px-4 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700">取消</button>
              <button
                onClick={async () => {
                  const name = confirmDeleteName;
                  setConfirmDeleteName(null);
                  setIsBusyProfiles(true);
                  try {
                    const app: any = await import('../../wailsjs/go/main/App');
                    await app.DeleteVehicleOrderSave(scPath, name);
                    await refreshSavedNames();
                    setMessage({ type: 'success', text: `已刪除：${name}.json` });
                  } catch (e: any) {
                    setMessage({ type: 'error', text: `刪除失敗：${e?.message || e}` });
                  } finally { setIsBusyProfiles(false); }
                }}
                className="px-4 py-2 text-sm rounded border bg-red-700/80 text-white border-red-900/60 hover:bg-red-700"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 另存新檔對話框 */}
      {saveAsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSaveAsOpen(false)} />
          <div className="relative bg-gradient-to-br from-gray-900 to-black text-gray-200 px-6 py-5 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-orange-900/50 w-full max-w-md">
            <h4 className="text-lg font-bold text-orange-400 mb-2">另存新檔</h4>
            <div className="text-sm text-gray-300 mb-3">輸入要儲存的檔名（將儲存於 Sort/save 資料夾）。</div>
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="例如：我的清單A"
              className="w-full px-3 py-2 text-sm border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSaveAsOpen(false)} className="px-4 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700">取消</button>
              <button onClick={handleSaveAs} disabled={!saveAsName.trim() || isBusyProfiles} className={`px-4 py-2 text-sm rounded border ${(!saveAsName.trim() || isBusyProfiles) ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-orange-600 text-white border-orange-500 hover:bg-orange-500'}`}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


