import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

export const Footer = () => {
  return (
    <div className="mt-6">
      <div className="max-w-5xl mx-auto text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-orange-900/50 to-transparent mb-4"></div>
        <p className="text-gray-600 text-xs">
          © 2025 Star Citizen 中文化工具 |
          <button
            onClick={() => BrowserOpenURL('https://squadron978.net')}
            className="text-orange-400 hover:text-orange-300 transition-colors ml-1 font-medium"
          >
            978中隊
          </button>
          {' '}維護
        </p>
      </div>
    </div>
  );
};


