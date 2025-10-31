import { useEffect } from 'react';
import './App.css';
// import { IntroSection } from './components/IntroSection';
import { useAppStore } from './store/appStore';
import { GettingStarted } from './components/GettingStarted';
import { ShipSorting } from './components/ShipSorting';
import { GetSystemInfo } from '../wailsjs/go/main/App';
import { Footer } from './components/Footer';
import { BrowserOpenURL } from '../wailsjs/runtime/runtime';

function App() {
    const { setSystemInfo, systemInfo, currentPage, setCurrentPage } = useAppStore();

    // 初始化系統資訊
    useEffect(() => {
        GetSystemInfo().then((info) => {
            setSystemInfo(info as { os: string; arch: string });
        });
    }, [setSystemInfo]);

    if (currentPage === 'localization') {
        return (
            <div className="min-h-screen bg-black p-6 flex flex-col">
				<div className="max-w-6xl xl:max-w-7xl min-w-[960px] mx-auto flex-1">
                    <GettingStarted />
                </div>
                <Footer />
            </div>
        );
    }
    if (currentPage === 'shipSorting') {
        return (
            <div className="min-h-screen bg-black p-6 flex flex-col">
                <div className="max-w-6xl xl:max-w-7xl min-w-[960px] mx-auto flex-1">
                    <ShipSorting />
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black p-6 flex flex-col">
            <div className="max-w-5xl mx-auto flex-1">
                {/* Header - 橘紅色主題 */}
                <div className="text-center mb-6">
                    <div className="inline-block mb-3">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 bg-clip-text text-transparent mb-2">
                            Star Citizen 中文化工具
                        </h1>
                        <div className="h-1 bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 rounded-full"></div>
                    </div>
                    <p className="text-gray-400">自動下載並安裝最新繁體中文化檔案</p>
                    {systemInfo && (
                        <p className="text-gray-600 text-xs mt-2">系統: {systemInfo.os} / {systemInfo.arch}</p>
                    )}
                </div>

                {/* 功能入口 */}
                <div className="mb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => setCurrentPage('localization')}
                            className="px-6 py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-500 hover:to-red-500 transition-all font-semibold text-sm shadow-lg hover:shadow-orange-900/50 border border-orange-900/50 text-left"
                        >
                            <div className="text-lg">中文化與語系管理</div>
                            <div className="text-xs text-orange-100/80">下載安裝中文化、設定語系、切換/重設</div>
                        </button>
                        <button
                            onClick={() => setCurrentPage('shipSorting')}
							className="px-6 py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-500 hover:to-red-500 transition-all font-semibold text-sm shadow-lg hover:shadow-orange-900/50 border border-orange-900/50 text-left"
                        >
                            <div className="text-lg">載具排序功能</div>
							<div className="text-xs text-orange-100/80">整理載具、排序、匯入/匯出</div>
                        </button>
                    </div>
                </div>

                {/* 已移至「開始使用」頁面 */}
            </div>
            {/* 重要聲明（貼近底部） */}
            <div className="max-w-5xl mx-auto w-full mt-2">
                <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-900/50 rounded-xl p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-orange-500 mb-2">重要聲明</h3>
                    <div className="text-sm text-gray-300 leading-relaxed">
                        本工具僅提供中文化檔案下載與語系設定等輔助功能，不會修改、破解、注入、蒐集或刪除任何使用者資料，亦不會對系統進行任何損害性操作。請您自行評估並承擔使用風險；若無法信任或感到疑慮，請不要使用。本工具之使用所致之任何資料遺失、異常或衍生損害，開發者與維護者恕不負擔任何責任。
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed mt-2">
                        此工具由 <span className="font-semibold text-orange-400">978中隊</span> 維護，請務必從
                        <button
                            onClick={() => BrowserOpenURL('https://squadron978.net')}
                            className="mx-1 text-orange-400 hover:text-orange-300 underline underline-offset-2"
                        >
                            官方網站
                        </button>
                        下載，不要相信其他任何來源的執行檔案，以免被駭或資料遭竊。
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed mt-2">
                        若您在使用過程中遇到問題，歡迎至
                        <button
                            onClick={() => BrowserOpenURL('https://discord.gg/qNNsXBuJqK')}
                            className="mx-1 text-orange-400 hover:text-orange-300 underline underline-offset-2"
                        >
                            978中隊 Discord
                        </button>聯繫我們。
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default App;
