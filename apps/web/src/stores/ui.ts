import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '@/lib/format';

export type Theme = 'light' | 'dark' | 'system';
/** What quick-add should start with when opened from another screen (e.g. "Chuyển ví" on the wallets page, "Thêm chi tiêu" in a category). All optional. */
export interface QuickAddInit { mode?: 'EXPENSE' | 'INCOME' | 'TRANSFER'; walletId?: string; categoryId?: string }
export interface UpgradeReason { key?: string; limit?: number; feature?: string }
export interface Toast { id: string; kind: 'info' | 'success' | 'warning' | 'error'; title: string; description?: string; action?: { label: string; onClick: () => void } }

/** UI state ONLY (theme, language, sheets, banners). Server data lives in TanStack Query; the access token in lib/api/session. */
interface UiState {
  theme: Theme; language: Lang;
  quickAddOpen: boolean;
  quickAddInit?: QuickAddInit;
  upgrade: { open: boolean; reason?: UpgradeReason };
  offline: boolean;
  toasts: Toast[];
  setTheme: (t: Theme) => void;
  setLanguage: (l: Lang) => void;
  openQuickAdd: (init?: QuickAddInit) => void; closeQuickAdd: () => void;
  openUpgrade: (r?: UpgradeReason) => void; closeUpgrade: () => void;
  setOffline: (v: boolean) => void;
  pushToast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
}

// ?theme=dark&lang=en overrides (handy for screenshots and support); never persisted
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const paramTheme = params.get('theme') as Theme | null;
const paramLang = params.get('lang') as Lang | null;

let n = 0;
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system', language: 'vi',
      quickAddOpen: false, upgrade: { open: false }, offline: false, toasts: [],
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      // onClick={() => openQuickAdd()} passes a click event: only a real QuickAddInit object counts as init
      openQuickAdd: (init) => set({ quickAddOpen: true, quickAddInit: init && typeof init === 'object' && ('mode' in init || 'walletId' in init || 'categoryId' in init) ? init : undefined }),
      closeQuickAdd: () => set({ quickAddOpen: false, quickAddInit: undefined }),
      openUpgrade: (reason) => set({ upgrade: { open: true, reason } }), closeUpgrade: () => set({ upgrade: { open: false } }),
      setOffline: (offline) => set((s) => (s.offline === offline ? s : { offline })),
      pushToast: (t) => {
        const id = `t${++n}`;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] })); // at most 4 on screen
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: 'sw-ui',
      partialize: (s) => ({ theme: s.theme, language: s.language }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return { ...current, ...p, ...(paramTheme ? { theme: paramTheme } : {}), ...(paramLang ? { language: paramLang } : {}) };
      },
    },
  ),
);

export const toast = {
  show: (t: Omit<Toast, 'id'>) => useUi.getState().pushToast(t),
  success: (title: string, description?: string) => useUi.getState().pushToast({ kind: 'success', title, description }),
  info: (title: string, description?: string) => useUi.getState().pushToast({ kind: 'info', title, description }),
  warning: (title: string, description?: string) => useUi.getState().pushToast({ kind: 'warning', title, description }),
  error: (title: string, description?: string) => useUi.getState().pushToast({ kind: 'error', title, description }),
};
