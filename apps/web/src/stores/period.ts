import { create } from 'zustand';

/** The month the user is looking at, shared by every screen (top-bar switcher). null = the current budget period. UI state only: not persisted. */
interface PeriodState { selected: string | null; select: (period: string | null) => void }
export const usePeriodStore = create<PeriodState>((set) => ({ selected: null, select: (selected) => set({ selected }) }));
