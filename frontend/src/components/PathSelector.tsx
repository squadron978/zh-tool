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
    setCurrentPage,
    setEditorTargetLocale,
  } = useAppStore();

  const [localizationPath, setLocalizationPath] = useState('');
  const [installedLocales, setInstalledLocales] = useState<string[]>([]);
  const [didInitLocalization, setDidInitLocalization] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState('');
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<string>('');
  const [currentUserLanguage, setCurrentUserLanguage] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importLocaleName, setImportLocaleName] = useState('');
  const [importFilePath, setImportFilePath] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [confirmDeleteLocale, setConfirmDeleteLocale] = useState<string | null>(null);

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

  // 選擇要匯入的檔案
  const handleSelectImportFile = async () => {
    try {
      const { SelectFile } = await import('../../wailsjs/go/main/App');
      const path = await SelectFile('選擇語系檔案 (global.ini)');
      if (path) {
        setImportFilePath(path);
      }
    } catch (e: any) {
      console.error('選擇檔案失敗:', e);
    }
  };

  // 執行匯入
  const handleImport = async () => {
    if (!isPathValid || !scPath || !importLocaleName.trim() || !importFilePath) {
      setSwitchMsg('請填寫語系名稱並選擇檔案');
      return;
    }

    setIsImporting(true);
    setSwitchMsg('');

    try {
      const app: any = await import('../../wailsjs/go/main/App');
      await app.SaveLocalLocaleFromFile(importLocaleName.trim(), importFilePath);
      setSwitchMsg(`成功匯入語系（已存到本機）：${importLocaleName}`);
      
      // 重新載入語系列表
      const { ListInstalledLocalizations } = await import('../../wailsjs/go/main/App');
      const locales = await ListInstalledLocalizations(scPath);
      setInstalledLocales(Array.isArray(locales) ? locales : []);
      
      // 清空輸入
      setImportLocaleName('');
      setImportFilePath('');
      setShowImportDialog(false);
    } catch (e: any) {
      setSwitchMsg(`匯入失敗：${e?.message || e}`);
    } finally {
      setIsImporting(false);
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
            {currentUserLanguage && (
              <div className="text-xs text-gray-400 mb-3">目前 system.cfg 語系：
                <span className="ml-1 text-orange-300 font-semibold">{currentUserLanguage}</span>
              </div>
            )}

            {/* 匯入按鈕 */}
            <div className="mb-3 flex justify-between">
              <button
                onClick={() => setShowImportDialog(!showImportDialog)}
                className="px-4 py-2 rounded border text-sm bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 border-orange-900/50"
              >
                + 匯入語系檔案
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
                className={`px-3 py-2 rounded border text-xs ${
                  (!isPathValid || switching)
                    ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                    : 'bg-gray-800 text-gray-300 border-orange-900/40 hover:bg-gray-700'
                }`}
              >
                重設為原版語系
              </button>
            </div>

            {/* 匯入對話框 */}
            {showImportDialog && (
              <div className="mb-3 p-4 bg-black/40 border border-orange-900/40 rounded-lg">
                <h4 className="text-sm font-bold text-orange-400 mb-3">匯入新語系</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">語系名稱（例如：chinese_(traditional)）</label>
                    <input
                      type="text"
                      value={importLocaleName}
                      onChange={(e) => setImportLocaleName(e.target.value)}
                      placeholder="輸入語系資料夾名稱..."
                      className="w-full px-3 py-2 text-sm border rounded bg-black/50 text-gray-300 placeholder-gray-600 border-gray-700 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">選擇 global.ini 檔案</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={importFilePath}
                        readOnly
                        placeholder="尚未選擇檔案..."
                        className="flex-1 px-3 py-2 text-xs border rounded bg-black/50 text-gray-400 placeholder-gray-600 border-gray-700 font-mono"
                      />
                      <button
                        onClick={handleSelectImportFile}
                        className="px-3 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                      >
                        選擇檔案
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={!importLocaleName.trim() || !importFilePath || isImporting}
                      className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                        (!importLocaleName.trim() || !importFilePath || isImporting)
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                          : 'bg-green-600 text-white border-green-500 hover:bg-green-500'
                      }`}
                    >
                      {isImporting ? '匯入中...' : '確認匯入'}
                    </button>
                    <button
                      onClick={() => {
                        setShowImportDialog(false);
                        setImportLocaleName('');
                        setImportFilePath('');
                      }}
                      className="px-3 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 語系列表表格 */}
            {installedLocales && installedLocales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">語系名稱</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">狀態</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-400">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installedLocales.map((locale, index) => (
                      <tr key={index} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="px-3 py-3 text-sm text-gray-300 font-mono">{locale}</td>
                        <td className="px-3 py-3 text-xs">
                          {currentUserLanguage === locale ? (
                            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-900/50 rounded">使用中</span>
                          ) : (
                            <span className="text-gray-500">未使用</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center flex items-center gap-2 justify-center">
                          {currentUserLanguage === locale && (
                            <button
                              onClick={async () => {
                                if (!isPathValid || !scPath || switching) return;
                                setSwitching(true);
                                setSwitchMsg('');
                                try {
                                  const app: any = await import('../../wailsjs/go/main/App');
                                  await app.ApplyLocalLocaleToGame(scPath, locale);
                                  setSwitchMsg(`已重新套用：${locale}`);
                                } catch (e: any) {
                                  setSwitchMsg(`重新套用失敗：${e?.message || e}`);
                                } finally {
                                  setSwitching(false);
                                }
                              }}
                              disabled={switching}
                              className={`px-3 py-1 rounded border text-xs ${
                                switching
                                  ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                  : 'bg-green-700/40 text-green-300 border-green-900/50 hover:bg-green-700/50'
                              }`}
                            >
                              重新套用
                            </button>
                          )}
                          {currentUserLanguage !== locale && (
                            <button
                              onClick={async () => {
                                if (!isPathValid || !scPath || switching) return;
                                setSwitching(true);
                                setSwitchMsg('');
                                try {
                                  // 先將使用中的語系（若有）移除 active.json 排序前綴
                                  try {
                                    const app: any = await import('../../wailsjs/go/main/App');
                                    if (currentUserLanguage) {
                                      await app.StripActiveVehicleOrderFromLocale(scPath, currentUserLanguage);
                                    }
                                  } catch {}
                                  // 將本機該語系套用到遊戲資料夾（需要授權）
                                  try {
                                    const app: any = await import('../../wailsjs/go/main/App');
                                    await app.ApplyLocalLocaleToGame(scPath, locale);
                                  } catch {}
                                  const p = await SetUserLanguage(scPath, locale);
                                  setSwitchMsg(`已切換至 ${locale}（寫入：${p}）`);
                                  try {
                                    const lang = await (await import('../../wailsjs/go/main/App')).GetUserLanguage(scPath);
                                    setCurrentUserLanguage(lang || '');
                                  } catch {}
                                  // 套用 active.json 排序到新語系
                                  try {
                                    const app: any = await import('../../wailsjs/go/main/App');
                                    await app.ApplyActiveVehicleOrderToLocale(scPath, locale);
                                  } catch {}
                                } catch (e: any) {
                                  setSwitchMsg(`切換失敗：${e?.message || e}`);
                                } finally {
                                  setSwitching(false);
                                }
                              }}
                              disabled={switching}
                              className={`px-3 py-1 rounded border text-xs ${
                                switching
                                  ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                  : 'bg-gray-800 text-orange-300 border-orange-900/40 hover:bg-gray-700'
                              }`}
                            >
                              切換
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!isPathValid || !scPath || switching) return;
                              setSwitching(true);
                              setSwitchMsg('');
                              try {
                                const app: any = await import('../../wailsjs/go/main/App');
                                const dest = await app.SaveFile('匯出 global.ini（已排除排序前綴）', `${locale}-global.ini`);
                                if (dest) {
                                  await app.ExportLocaleFileStripped(scPath, locale, dest);
                                  setSwitchMsg(`已匯出（已排除排序前綴）${locale} 的 global.ini 至：${dest}`);
                                }
                              } catch (e: any) {
                                setSwitchMsg(`匯出失敗：${e?.message || e}`);
                              } finally {
                                setSwitching(false);
                              }
                            }}
                            disabled={switching}
                            className={`px-3 py-1 rounded border text-xs ${
                              switching
                                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                : 'bg-gray-800 text-gray-300 border-orange-900/40 hover:bg-gray-700'
                            }`}
                          >
                            匯出
                          </button>
                          <button
                            onClick={() => {
                              setEditorTargetLocale(locale);
                              setCurrentPage('localization');
                              setSwitchMsg(`正在切換至編輯器：${locale}`);
                            }}
                            disabled={switching}
                            className={`px-3 py-1 rounded border text-xs ${
                              switching
                                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                : 'bg-blue-900/30 text-blue-300 border-blue-900/50 hover:bg-blue-900/40'
                            }`}
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => {
                              if (currentUserLanguage === locale) {
                                setSwitchMsg('使用中的語系不可刪除');
                                return;
                              }
                              setConfirmDeleteLocale(locale);
                            }}
                            disabled={switching || currentUserLanguage === locale}
                            title={currentUserLanguage === locale ? '使用中的語系不可刪除' : ''}
                            className={`px-3 py-1 rounded border text-xs ${
                              (switching || currentUserLanguage === locale)
                                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                : 'bg-red-900/30 text-red-300 border-red-900/50 hover:bg-red-900/40'
                            }`}
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-sm">
                <div className="mb-2">📋</div>
                <div>尚未偵測到任何語系資料夾</div>
              </div>
            )}
            {switchMsg && (
              <div className="mt-3 p-2 text-xs text-orange-300 bg-orange-950/20 border border-orange-900/40 rounded">
                {switchMsg}
              </div>
            )}
          </div>
        )}
        {/* 確認刪除語系對話框 */}
        {confirmDeleteLocale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDeleteLocale(null)} />
            <div className="relative bg-gradient-to-br from-gray-900 to-black text-gray-200 px-6 py-5 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-orange-900/50 w-full max-w-md">
              <h4 className="text-lg font-bold text-orange-400 mb-2">確認刪除語系</h4>
              <div className="text-sm text-gray-300 mb-3">確定要刪除語系 <span className="text-orange-300 font-mono">{confirmDeleteLocale}</span> 的資料夾嗎？此動作將移除其 `global.ini` 及相關檔案。</div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDeleteLocale(null)} className="px-4 py-2 text-sm rounded border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700">取消</button>
                <button
                  onClick={async () => {
                    const target = confirmDeleteLocale;
                    if (currentUserLanguage === target) {
                      setConfirmDeleteLocale(null);
                      setSwitchMsg('使用中的語系不可刪除');
                      return;
                    }
                    setConfirmDeleteLocale(null);
                    setSwitching(true);
                    setSwitchMsg('');
                    try {
                      const app: any = await import('../../wailsjs/go/main/App');
                      await app.DeleteLocalization(scPath, target);
                      // 重新載入語系列表
                      const locales = await app.ListInstalledLocalizations(scPath);
                      setInstalledLocales(Array.isArray(locales) ? locales : []);
                      // 若當前使用的是被刪除的語系，嘗試讀取目前 system.cfg；若已不在列表，顯示未使用
                      try {
                        const lang = await app.GetUserLanguage(scPath);
                        setCurrentUserLanguage(lang || '');
                      } catch {}
                      setSwitchMsg(`已刪除語系：${target}`);
                    } catch (e: any) {
                      setSwitchMsg(`刪除失敗：${e?.message || e}`);
                    } finally {
                      setSwitching(false);
                    }
                  }}
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

