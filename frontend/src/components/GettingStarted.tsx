import * as Tabs from '@radix-ui/react-tabs';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { PathSelector } from './PathSelector';
import { ListInstalledLocalizations, DownloadAndInstallLocalization, SetUserLanguage, DetectStarCitizenPath, ValidateStarCitizenPath, CheckLocalizationExists } from '../../wailsjs/go/main/App';

export const GettingStarted = () => {
  const { setCurrentPage, scPath, isPathValid, bumpLocalesVersion, setScPath, setIsPathValid, setIsPathDetecting, setLocalizationExists } = useAppStore();
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChineseLocale, setHasChineseLocale] = useState(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [tabsValue, setTabsValue] = useState<'tab-auto' | 'tab-locale-path' | 'tab-locale-files'>('tab-auto');
  const [advancedNotice, setAdvancedNotice] = useState('');

  // 追蹤目前是否已有 chinese_tranditional
  useEffect(() => {
    const checkLocales = async () => {
      setHasChineseLocale(false);
      if (!isPathValid || !scPath) return;
      try {
        const locales = await ListInstalledLocalizations(scPath);
        if (Array.isArray(locales)) {
          setHasChineseLocale(locales.includes('chinese_(traditional)'));
        }
      } catch {}
    };
    void checkLocales();
  }, [scPath, isPathValid]);

  // 進入頁面時嘗試自動偵測路徑（若尚未設定）
  useEffect(() => {
    const initDetect = async () => {
      if (scPath) return;
      setIsPathDetecting(true);
      try {
        const detected = await DetectStarCitizenPath();
        if (detected) {
          setScPath(detected);
          const valid = await ValidateStarCitizenPath(detected);
          setIsPathValid(valid);
          if (valid) {
            const exists = await CheckLocalizationExists(detected);
            setLocalizationExists(exists);
          }
        }
      } catch (e) {
        console.error('初始化自動偵測失敗', e);
      } finally {
        setIsPathDetecting(false);
      }
    };
    void initDetect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadInstall = async () => {
    if (!isPathValid || !scPath) {
      setAdvancedNotice('請重新設定至正確的安裝目錄');
      setTabsValue('tab-locale-path');
      setInstallMsg({ type: 'error', text: '請重新設定至正確的安裝目錄' });
      return;
    }
    if (isInstalling) return;
    setIsInstalling(true);
    setInstallMsg(null);
    setShowSuccess(false);
    setInstallLogs([]);
    try {
      const log = (m: string) => setInstallLogs((prev) => [...prev, m]);
      log('開始處理...');
      log(`偵測安裝目錄：${scPath}`);
      log(hasChineseLocale ? '偵測到已存在中文語系，將執行自動更新' : '未偵測到中文語系，將執行自動安裝');
      const url = 'https://squadron978.net/api/localization/latest/global.ini';
      log('下載中文化檔案中...');
      const saved = await DownloadAndInstallLocalization(scPath, url);
      log(`下載完成並寫入：${saved}`);
      log('設定 system.cfg 語系為 chinese_(traditional)...');
      await SetUserLanguage(scPath, 'chinese_(traditional)');
      log('system.cfg 設定完成');
      setInstallMsg({ type: 'success', text: `已完成${hasChineseLocale ? '更新' : '安裝'}：${saved}` });
      // 重新檢查語系狀態
      log('重新偵測語系列表...');
      const locales = await ListInstalledLocalizations(scPath);
      setHasChineseLocale(Array.isArray(locales) && locales.includes('chinese_(traditional)'));
      bumpLocalesVersion();
      log('流程已完成');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3500);
    } catch (e: any) {
      setInstallMsg({ type: 'error', text: '網路有問題，請稍後重試' });
      setInstallLogs((prev) => [...prev, '網路有問題，請稍後重試']);
    } finally {
      setIsInstalling(false);
    }
  };

  // 每次有新日誌，自動捲到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [installLogs]);

  return (
    <div className="w-full bg-gradient-to-br from-gray-900 to-black border border-orange-900/50 rounded-xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-orange-400">中文化與語系管理</h2>
        <button
          onClick={() => setCurrentPage('home')}
          className="px-4 py-2 text-sm bg-gray-800 text-orange-300 rounded-lg border border-orange-900/50 hover:bg-gray-700"
        >
          ← 返回首頁
        </button>
      </div>

      <Tabs.Root value={tabsValue} onValueChange={(v) => setTabsValue(v as any)}>
        <Tabs.List className="flex gap-2 border-b border-orange-900/40 mb-4">
          <Tabs.Trigger
            value="tab-auto"
            className="px-4 py-2 text-sm rounded-t-lg data-[state=active]:bg-orange-900/30 data-[state=active]:text-orange-300 text-gray-300 hover:text-white"
          >
            自動中文化
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab-locale-path"
            className="px-4 py-2 text-sm rounded-t-lg data-[state=active]:bg-orange-900/30 data-[state=active]:text-orange-300 text-gray-300 hover:text-white"
          >
            進階設定
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab-locale-files"
            className="px-4 py-2 text-sm rounded-t-lg data-[state=active]:bg-orange-900/30 data-[state=active]:text-orange-300 text-gray-300 hover:text-white"
          >
            語系檔管理
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="tab-auto" className="w-full p-4 rounded-lg bg-black/30 border border-orange-900/30">
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/30 rounded-xl p-5 shadow-2xl">
              <h3 className="text-xl font-bold text-orange-500 mb-4">自動安裝中文化</h3>
              {installMsg && (
                <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${installMsg.type === 'success' ? 'text-green-400 bg-green-950/30 border-green-900/50' : 'text-red-400 bg-red-950/30 border-red-900/50'}`}>
                  {installMsg.text}
                </div>
              )}
              <button
                onClick={handleDownloadInstall}
                disabled={!isPathValid || isInstalling}
                className={`w-full px-5 py-3 rounded-lg font-medium border transition ${(!isPathValid || isInstalling) ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700' : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 border-orange-900/50'}`}
              >
                {isInstalling ? '下載中…' : hasChineseLocale ? '自動更新最新版中文化' : '開始自動安裝中文化'}
              </button>
              {installLogs.length > 0 && (
                <div ref={logRef} className="mt-3 max-h-40 overflow-auto bg-black/30 border border-orange-900/30 rounded p-3 text-xs text-gray-300 space-y-1">
                  {installLogs.map((l, i) => (
                    <div key={i}>• {l}</div>
                  ))}
                </div>
              )}
              {showSuccess && (
                <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
                  {/* 背景模糊遮罩 */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm success-overlay"></div>
                  {/* 提示彈窗 */}
                  <div className="relative toast-animate bg-gradient-to-br from-orange-600 to-red-600 text-white px-8 py-6 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-orange-900/50">
                    <div className="text-lg font-bold drop-shadow">執行完成，請盡情享受中文化後的星際公民</div>
                  </div>
                </div>
              )}
              {!isPathValid && (
                <p className="mt-2 text-xs text-gray-500">需先選擇有效的 Star Citizen 安裝目錄才能下載與安裝，請切請至進階設定頁面進行設定。</p>
              )}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="tab-locale-path" className="w-full p-4 rounded-lg bg-black/30 border border-orange-900/30">
          {advancedNotice && (
            <div className="mb-3 text-sm text-orange-300 bg-orange-950/30 border border-orange-900/50 rounded px-3 py-2">{advancedNotice}</div>
          )}
          <PathSelector showPathSection={true} showLocaleSection={false} />
        </Tabs.Content>

        <Tabs.Content value="tab-locale-files" className="w-full p-4 rounded-lg bg-black/30 border border-orange-900/30">
          <PathSelector showPathSection={false} showLocaleSection={true} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};


