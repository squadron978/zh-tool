import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  DetectStarCitizenPath,
  SelectDirectory,
  ValidateStarCitizenPath,
  CheckLocalizationExists,
  GetLocalizationPath,
  HasLocalizationBase,
  CreateLocalizationDir,
  ListInstalledLocalizations,
  SetUserLanguage,
  ResetToDefaultLanguage,
} from '../../wailsjs/go/main/App';

export const PathSelector = ({ showPathSection = true, showLocaleSection = true }: { showPathSection?: boolean; showLocaleSection?: boolean }) => {
  const {
    scPath,
    isPathValid,
    isPathDetecting,
    localizationExists,
    setScPath,
    setIsPathValid,
    setIsPathDetecting,
    setLocalizationExists,
    resetPath,
    localesVersion,
  } = useAppStore();

  const [localizationPath, setLocalizationPath] = useState('');
  const [installedLocales, setInstalledLocales] = useState<string[]>([]);
  const [didInitLocalization, setDidInitLocalization] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState('');
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<string>('');
  const [currentUserLanguage, setCurrentUserLanguage] = useState('');

  // 掛載時自動偵測一次（若尚未有路徑且未在偵測中）
  useEffect(() => {
    if (!scPath && !isPathDetecting) {
      void handleAutoDetect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 當路徑有效時，列出已安裝語系
  useEffect(() => {
    const fetchLocales = async () => {
      if (!isPathValid || !scPath) {
        setInstalledLocales([]);
        setCurrentUserLanguage('');
        return;
      }
      try {
        const hasHasBaseApi = (window as any)?.go?.main?.App?.HasLocalizationBase;
        const hasCreateDirApi = (window as any)?.go?.main?.App?.CreateLocalizationDir;
        const hasListApi = (window as any)?.go?.main?.App?.ListInstalledLocalizations;

        const baseExists = hasHasBaseApi ? await HasLocalizationBase(scPath) : true;
        if (!baseExists) {
          if (hasCreateDirApi) {
            await CreateLocalizationDir(scPath);
          }
          setDidInitLocalization(true);
          setLocalizationExists(false);
        } else {
          setDidInitLocalization(false);
        }
        const locPath = await GetLocalizationPath(scPath);
        setLocalizationPath(locPath);
        if (hasListApi) {
          const locales = await ListInstalledLocalizations(scPath);
          setInstalledLocales(Array.isArray(locales) ? locales : []);
        } else {
          setInstalledLocales([]);
        }
        // 讀取 user.cfg 中目前語系
        const hasGetUserLangApi = (window as any)?.go?.main?.App?.GetUserLanguage;
        if (hasGetUserLangApi) {
          try {
            const lang = await (await import('../../wailsjs/go/main/App')).GetUserLanguage(scPath);
            setCurrentUserLanguage(lang || '');
          } catch {
            setCurrentUserLanguage('');
          }
        } else {
          setCurrentUserLanguage('');
        }
      } catch (e) {
        console.error('讀取語系列表失敗:', e);
        setInstalledLocales([]);
        setCurrentUserLanguage('');
      }
    };
    void fetchLocales();
  }, [isPathValid, scPath, localesVersion]);

  // 已安裝語系列表更新時，預設選取第一個
  useEffect(() => {
    if (installedLocales && installedLocales.length > 0) {
      setSelectedLocale(installedLocales[0]);
    } else {
      setSelectedLocale('');
    }
  }, [installedLocales]);

  // 自動偵測路徑
  const handleAutoDetect = async () => {
    setIsPathDetecting(true);
    try {
      const detectedPath = await DetectStarCitizenPath();
      if (detectedPath) {
        setScPath(detectedPath);
        const valid = await ValidateStarCitizenPath(detectedPath);
        setIsPathValid(valid);
        
        if (valid) {
          const hasHasBaseApi = (window as any)?.go?.main?.App?.HasLocalizationBase;
          const hasCreateDirApi = (window as any)?.go?.main?.App?.CreateLocalizationDir;
          const hasListApi = (window as any)?.go?.main?.App?.ListInstalledLocalizations;

          const baseExists = hasHasBaseApi ? await HasLocalizationBase(detectedPath) : true;
          if (!baseExists) {
            if (hasCreateDirApi) {
              await CreateLocalizationDir(detectedPath);
            }
            setDidInitLocalization(true);
          } else {
            setDidInitLocalization(false);
          }
          const exists = await CheckLocalizationExists(detectedPath);
          setLocalizationExists(exists);
          const locPath = await GetLocalizationPath(detectedPath);
          setLocalizationPath(locPath);
          if (hasListApi) {
            const locales = await ListInstalledLocalizations(detectedPath);
            setInstalledLocales(Array.isArray(locales) ? locales : []);
          } else {
            setInstalledLocales([]);
          }
        }
      } else {
        // 未找到路徑
        setScPath('');
        setIsPathValid(false);
      }
    } catch (error) {
      console.error('自動偵測失敗:', error);
    } finally {
      setIsPathDetecting(false);
    }
  };

  // 手動選擇路徑
  const handleManualSelect = async () => {
    try {
      const selectedPath = await SelectDirectory();
      if (selectedPath) {
        setScPath(selectedPath);
        const valid = await ValidateStarCitizenPath(selectedPath);
        setIsPathValid(valid);
        
        if (valid) {
          const hasHasBaseApi = (window as any)?.go?.main?.App?.HasLocalizationBase;
          const hasCreateDirApi = (window as any)?.go?.main?.App?.CreateLocalizationDir;
          const hasListApi = (window as any)?.go?.main?.App?.ListInstalledLocalizations;

          const baseExists = hasHasBaseApi ? await HasLocalizationBase(selectedPath) : true;
          if (!baseExists) {
            if (hasCreateDirApi) {
              await CreateLocalizationDir(selectedPath);
            }
            setDidInitLocalization(true);
          } else {
            setDidInitLocalization(false);
          }
          const exists = await CheckLocalizationExists(selectedPath);
          setLocalizationExists(exists);
          const locPath = await GetLocalizationPath(selectedPath);
          setLocalizationPath(locPath);
          if (hasListApi) {
            const locales = await ListInstalledLocalizations(selectedPath);
            setInstalledLocales(Array.isArray(locales) ? locales : []);
          } else {
            setInstalledLocales([]);
          }
        }
      }
    } catch (error) {
      console.error('選擇路徑失敗:', error);
    }
  };

  // 移除自動偵測，改為用戶手動觸發
  // useEffect(() => {
  //   handleAutoDetect();
  // }, []);

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/50 rounded-xl shadow-2xl p-5">
      {showPathSection && (
        <h3 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2">
          <span className="text-2xl">📁</span>
          遊戲路徑設定
        </h3>
      )}

      {showPathSection && (
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={scPath}
            readOnly
            placeholder="尚未選擇或偵測到遊戲路徑..."
            className={`flex-1 px-4 py-3 text-sm border rounded-lg bg-black/50 text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 ${
              scPath && (isPathValid ? 'border-green-600 focus:ring-green-600/50' : 'border-red-600 focus:ring-red-600/50')
            } ${!scPath && 'border-gray-700 focus:ring-orange-600/50'}`}
          />
          {scPath && (
            <button
              onClick={resetPath}
              className="px-4 py-3 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 hover:text-white transition-colors text-sm font-medium border border-gray-700"
            >
              清除
            </button>
          )}
        </div>

        {/* 路徑狀態指示 */}
        {scPath && (
          <div className="mt-3">
            {isPathValid ? (
              <div className="text-green-400 text-sm bg-green-950/30 border border-green-900/50 rounded-lg px-3 py-2">
                ✓ 有效的 Star Citizen 安裝目錄
              </div>
            ) : (
              <div className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
                ✗ 無效的目錄，請重新選擇
              </div>
            )}
          </div>
        )}

        {/* 操作按鈕（移到輸入框下方） */}
        <div className="mt-3 flex gap-3">
          <button
            onClick={handleAutoDetect}
            disabled={isPathDetecting}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-500 hover:to-red-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all text-sm font-semibold shadow-lg hover:shadow-orange-900/50"
          >
            {isPathDetecting ? '🔍 偵測中...' : '🎯 自動偵測'}
          </button>
          <button
            onClick={handleManualSelect}
            className="flex-1 px-4 py-3 bg-gray-800 text-orange-400 rounded-lg hover:bg-gray-700 transition-colors text-sm font-semibold border border-orange-900/50 hover:border-orange-700/50"
          >
            📂 手動選擇
          </button>
        </div>
      </div>
      )}

      {/* 語系狀態與切換（可選） */}
      {showLocaleSection && isPathValid && localizationPath && (
          <div className="mt-3 p-4 bg-orange-950/20 border border-orange-900/40 rounded-lg">
            <div className="text-sm text-orange-200 mb-2">
              <strong className="text-orange-400">語系檔案路徑：</strong>
              <div className="mt-1 text-xs text-gray-400 break-all font-mono bg-black/40 p-2 rounded">{localizationPath}</div>
            </div>
            {didInitLocalization && (
              <div className="mb-2 text-xs text-orange-300 bg-orange-950/30 border border-orange-900/40 rounded px-3 py-2">
                已建立 Localization 資料夾（初始化完成）
              </div>
            )}
            <div className="text-sm text-orange-200 mb-2">
              <strong className="text-orange-400">已偵測到語系：</strong>
              <span className="ml-1 text-gray-300">{installedLocales?.length ?? 0}</span>
            </div>
            {currentUserLanguage && (
              <div className="text-xs text-gray-400 mb-2">目前 system.cfg 語系：
                <span className="ml-1 text-orange-300">{currentUserLanguage}</span>
              </div>
            )}
            {installedLocales && installedLocales.length > 0 ? (
              <div className="flex items-center gap-2 text-sm">
                <label className="text-xs text-gray-400">選擇語系資料夾</label>
                <select
                  value={selectedLocale}
                  onChange={(e) => setSelectedLocale(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-orange-900/40 rounded text-gray-200 text-xs"
                >
                  {installedLocales.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!isPathValid || !scPath || !selectedLocale || switching) return;
                    setSwitching(true);
                    setSwitchMsg('');
                    try {
                      const p = await SetUserLanguage(scPath, selectedLocale);
                      setSwitchMsg(`已切換至 ${selectedLocale}（寫入：${p}）`);
                      // refresh current language display
                      try {
                        const lang = await (await import('../../wailsjs/go/main/App')).GetUserLanguage(scPath);
                        setCurrentUserLanguage(lang || '');
                      } catch {}
                    } catch (e: any) {
                      setSwitchMsg(`切換失敗：${e?.message || e}`);
                    } finally {
                      setSwitching(false);
                    }
                  }}
                  disabled={!isPathValid || !selectedLocale || switching}
                  className={`px-3 py-2 rounded border text-xs ${(!isPathValid || !selectedLocale || switching) ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-gray-800 text-orange-300 border-orange-900/40 hover:bg-gray-700'}`}
                >
                  {switching ? '處理中…' : '切換至此語系'}
                </button>
                <button
                  onClick={async () => {
                    if (!isPathValid || !scPath || switching) return;
                    setSwitching(true);
                    setSwitchMsg('');
                    try {
                      await ResetToDefaultLanguage(scPath);
                      setSwitchMsg('已重設為原版語系（system.cfg 已移除）');
                      setCurrentUserLanguage('');
                    } catch (e: any) {
                      setSwitchMsg(`重設失敗：${e?.message || e}`);
                    } finally {
                      setSwitching(false);
                    }
                  }}
                  disabled={!isPathValid || switching}
                  className={`px-3 py-2 rounded border text-xs ${(!isPathValid || switching) ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-gray-800 text-gray-300 border-orange-900/40 hover:bg-gray-700'}`}
                >
                  重設為原版語系
                </button>
              </div>
            ) : (
              <span className="text-gray-400 text-sm">尚未偵測到任何語系資料夾</span>
            )}
            {switchMsg && (
              <div className="mt-2 text-xs text-orange-300">
                {switchMsg}
              </div>
            )}
          </div>
        )}
    </div>
  );
};

