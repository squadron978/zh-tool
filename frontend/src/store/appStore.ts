import { create } from 'zustand';
import { config } from '../config';

interface AppState {
  // Star Citizen 路徑
  scPath: string;
  isPathValid: boolean;
  isPathDetecting: boolean;
  localizationExists: boolean;

  // 導覽狀態
  currentPage: 'home' | 'localization' | 'shipSorting';

  // 語系列表刷新版本號（讓元件能監聽變化以重新偵測）
  localesVersion: number;

  // 編輯器導向：指定欲編輯的語系名稱（由 PathSelector 觸發，LocaleEditor 讀取）
  editorTargetLocale: string | null;
  
  // 系統資訊
  systemInfo: {
    os: string;
    arch: string;
  } | null;

  // 官網 URL
  officialWebsite: string;
  
  // Actions
  setScPath: (path: string) => void;
  setIsPathValid: (valid: boolean) => void;
  setIsPathDetecting: (detecting: boolean) => void;
  setLocalizationExists: (exists: boolean) => void;
  setSystemInfo: (info: { os: string; arch: string }) => void;
  resetPath: () => void;
  setCurrentPage: (page: 'home' | 'localization' | 'shipSorting') => void;
  bumpLocalesVersion: () => void;
  setEditorTargetLocale: (locale: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  scPath: '',
  isPathValid: false,
  isPathDetecting: false,
  localizationExists: false,
  currentPage: 'home',
  localesVersion: 0,
  editorTargetLocale: null,
  systemInfo: null,
  officialWebsite: config.officialWebsite,
  
  // Actions
  setScPath: (path) => set({ scPath: path }),
  setIsPathValid: (valid) => set({ isPathValid: valid }),
  setIsPathDetecting: (detecting) => set({ isPathDetecting: detecting }),
  setLocalizationExists: (exists) => set({ localizationExists: exists }),
  setSystemInfo: (info) => set({ systemInfo: info }),
  resetPath: () => set({ scPath: '', isPathValid: false, localizationExists: false }),
  setCurrentPage: (page) => set({ currentPage: page }),
  bumpLocalesVersion: () => set((state) => ({ localesVersion: state.localesVersion + 1 })),
  setEditorTargetLocale: (locale) => set({ editorTargetLocale: locale }),
}));

