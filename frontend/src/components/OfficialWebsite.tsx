import { useAppStore } from '../store/appStore';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

export const OfficialWebsite = () => {
  const { officialWebsite } = useAppStore();

  const handleOpenWebsite = () => {
    BrowserOpenURL(officialWebsite);
  };

  return (
    <div className="bg-gradient-to-r from-gray-900 to-black border border-orange-900/50 rounded-xl shadow-xl p-5 hover:border-orange-700/50 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-orange-400 mb-1">🌐 官方網站</h3>
          <p className="text-sm text-gray-400">獲取最新資訊、教學文件與社群支援</p>
        </div>
        <button
          onClick={handleOpenWebsite}
          className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-500 hover:to-red-500 transition-all font-semibold text-sm shadow-lg hover:shadow-orange-900/50"
        >
          前往官網 →
        </button>
      </div>
    </div>
  );
};

