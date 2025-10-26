# 前端套件設置說明

此專案已安裝並配置以下前端工具和元件庫：

## 已安裝的套件

### 1. Tailwind CSS
- **用途**: 實用優先的 CSS 框架
- **版本**: v4.x (最新版本)
- **配置文件**: 
  - `tailwind.config.js` - Tailwind 配置
  - `postcss.config.js` - PostCSS 配置（使用 @tailwindcss/postcss）
  - `src/style.css` - 已加入 Tailwind 指令
- **注意**: Tailwind CSS v4 需要使用 `@tailwindcss/postcss` 作為 PostCSS 插件

### 2. Radix UI
- **用途**: 無樣式、可訪問的 UI 元件庫
- **已安裝的元件**:
  - `@radix-ui/react-slot` - 組合元件工具
  - `@radix-ui/react-dialog` - 對話框元件
  - `@radix-ui/react-dropdown-menu` - 下拉選單
  - `@radix-ui/react-tooltip` - 工具提示
  - `@radix-ui/react-tabs` - 分頁元件
  - `@radix-ui/react-select` - 選擇器
  - `@radix-ui/react-popover` - 彈出框

### 3. Zustand
- **用途**: 輕量級狀態管理庫
- **版本**: 最新版本

## 使用範例

### Zustand 狀態管理
```typescript
// 定義 store (範例在 src/store/useStore.ts)
import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

// 在元件中使用
const { count, increment } = useStore();
```

### Radix UI 元件
```typescript
import * as Dialog from '@radix-ui/react-dialog';

// 使用 Dialog 元件
<Dialog.Root>
  <Dialog.Trigger>開啟對話框</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Content>
      內容
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Tailwind CSS
```tsx
// 直接在 className 中使用 Tailwind 類別
<div className="flex items-center gap-4 p-6 bg-white rounded-lg shadow-md">
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    按鈕
  </button>
</div>
```

## 範例元件

專案中已包含以下範例元件供參考：

1. **src/components/ZustandExample.tsx** - Zustand 使用範例
2. **src/components/RadixExample.tsx** - Radix UI 元件範例
3. **src/store/useStore.ts** - Zustand store 定義範例

## 開發指令

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建構專案
npm run build
```

## 更多資源

- [Tailwind CSS 文件](https://tailwindcss.com/docs)
- [Radix UI 文件](https://www.radix-ui.com/docs/primitives/overview/introduction)
- [Zustand 文件](https://github.com/pmndrs/zustand)

