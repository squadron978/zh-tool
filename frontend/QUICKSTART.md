# 🚀 快速入門指南

恭喜！你的前端專案已經成功整合了 Tailwind CSS、Radix UI 和 Zustand。

## ✅ 已完成的設置

### 1️⃣ 已安裝的套件

| 套件 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | v4.x | CSS 框架 |
| @tailwindcss/postcss | 最新 | Tailwind v4 PostCSS 插件 |
| Zustand | v5.x | 狀態管理 |
| Radix UI (多個元件) | 最新 | 無樣式 UI 元件 |

### 2️⃣ 已創建的配置文件

- ✅ `tailwind.config.js` - Tailwind 配置
- ✅ `postcss.config.js` - PostCSS 配置
- ✅ `src/style.css` - 已加入 Tailwind 指令

### 3️⃣ 已創建的範例文件

- ✅ `src/store/useStore.ts` - Zustand store 範例
- ✅ `src/components/ZustandExample.tsx` - Zustand 使用範例
- ✅ `src/components/RadixExample.tsx` - Radix UI 元件範例
- ✅ `src/App.example.tsx` - 完整整合範例

## 🎯 如何開始使用

### 選項 1: 使用範例 App（推薦）

將 `App.example.tsx` 重新命名為 `App.tsx` 來查看完整的整合範例：

```bash
# 在 frontend 目錄下執行
mv src/App.tsx src/App.backup.tsx
mv src/App.example.tsx src/App.tsx
```

### 選項 2: 手動整合到現有程式碼

參考以下範例文件來整合功能到你現有的程式碼：

1. 查看 `src/components/ZustandExample.tsx` 學習如何使用 Zustand
2. 查看 `src/components/RadixExample.tsx` 學習如何使用 Radix UI
3. 在任何元件中使用 Tailwind 的工具類別

### 選項 3: 從頭開始

直接在你的元件中開始使用這些工具：

```tsx
import { useStore } from './store/useStore';
import * as Dialog from '@radix-ui/react-dialog';

function MyComponent() {
  const { count, increment } = useStore();
  
  return (
    <div className="p-4 bg-blue-500 text-white rounded-lg">
      <p>Count: {count}</p>
      <button onClick={increment} className="px-4 py-2 bg-white text-blue-500 rounded">
        增加
      </button>
    </div>
  );
}
```

## 🔧 開發指令

```bash
# 安裝依賴（如果還沒安裝）
npm install

# 啟動開發伺服器
npm run dev

# 建構生產版本
npm run build

# 預覽建構結果
npm run preview
```

## 📚 快速參考

### Tailwind CSS 常用類別

```tsx
// 佈局
<div className="flex items-center justify-center gap-4">
<div className="grid grid-cols-3 gap-4">

// 間距
<div className="p-4 m-2">  // padding: 1rem, margin: 0.5rem
<div className="px-6 py-3"> // padding-x: 1.5rem, padding-y: 0.75rem

// 顏色
<div className="bg-blue-500 text-white">
<div className="border border-gray-300">

// 圓角和陰影
<div className="rounded-lg shadow-xl">
```

### Zustand 快速使用

```tsx
// 1. 使用 store
const { count, increment } = useStore();

// 2. 使用狀態
<p>{count}</p>

// 3. 更新狀態
<button onClick={increment}>增加</button>
```

### Radix UI 常用元件

```tsx
// Dialog (對話框)
import * as Dialog from '@radix-ui/react-dialog';

// Dropdown Menu (下拉選單)
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

// Tooltip (工具提示)
import * as Tooltip from '@radix-ui/react-tooltip';
```

## 🎨 自訂主題

你可以在 `tailwind.config.js` 中自訂 Tailwind 的主題：

```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'custom-blue': '#1e40af',
      },
      fontFamily: {
        'custom': ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

## 📖 更多資源

- [Tailwind CSS 文件](https://tailwindcss.com/docs) - 完整的 CSS 類別參考
- [Radix UI 文件](https://www.radix-ui.com/docs/primitives/overview/introduction) - 元件使用指南
- [Zustand 文件](https://github.com/pmndrs/zustand) - 狀態管理教學

## ⚡ 測試建置

已測試建置成功 ✅

```bash
> frontend@0.0.0 build
> tsc && vite build

✓ 35 modules transformed.
dist/index.html                                       0.36 KiB
dist/assets/index.35c76b99.css                        4.02 KiB
dist/assets/index.98874b18.js                         140.40 KiB
```

---

現在你已經準備好開始使用這些強大的工具來建構你的應用程式了！🎉


