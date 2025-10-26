import { useAppStore } from '../store/appStore';

export const ShipSorting = () => {
  const { setCurrentPage } = useAppStore();

  return (
    <div className="w-full bg-gradient-to-br from-gray-900 to-black border border-orange-900/50 rounded-xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-orange-400">載具排序功能</h2>
        <button
          onClick={() => setCurrentPage('home')}
          className="px-4 py-2 text-sm bg-gray-800 text-orange-300 rounded-lg border border-orange-900/50 hover:bg-gray-700"
        >
          ← 返回首頁
        </button>
      </div>
      <div className="text-sm text-gray-400">此功能即將推出。</div>
    </div>
  );
};


