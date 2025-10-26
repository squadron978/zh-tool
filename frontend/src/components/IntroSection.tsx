export const IntroSection = () => {
  return (
    <div className="bg-gradient-to-br from-orange-950 to-red-950 rounded-xl shadow-2xl p-5 border border-orange-900/50">
      <h2 className="text-xl font-bold text-orange-400 mb-3 flex items-center gap-2">
        <span className="text-2xl">⚡</span>
        功能特色
      </h2>
      <p className="text-orange-200/80 text-sm mb-4 leading-relaxed">
        自動下載並安裝最新的 Star Citizen 繁體中文化檔案，讓您輕鬆享受中文遊戲體驗
      </p>
      <div className="space-y-2 text-sm text-orange-100">
        <div className="flex items-start gap-3 bg-black/30 p-3 rounded-lg">
          <span className="text-orange-500 font-bold">•</span>
          <span>智慧偵測遊戲安裝路徑</span>
        </div>
        <div className="flex items-start gap-3 bg-black/30 p-3 rounded-lg">
          <span className="text-orange-500 font-bold">•</span>
          <span>一鍵快速安裝中文化檔案</span>
        </div>
        <div className="flex items-start gap-3 bg-black/30 p-3 rounded-lg">
          <span className="text-orange-500 font-bold">•</span>
          <span>支援自訂路徑手動選擇</span>
        </div>
      </div>
    </div>
  );
};

