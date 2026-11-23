import { useUi } from '@/stores/ui';
import type { Lang } from '@/lib/format';

export const useLang = (): Lang => useUi((s) => s.language);
