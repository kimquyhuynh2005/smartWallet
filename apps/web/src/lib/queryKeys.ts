/** One key factory per module so invalidation is precise ("budgets changed" never refetches wallets). */
export const qk = {
  me: ['me'] as const,
  plan: ['plan'] as const,
  wallets: { all: ['wallets'] as const, list: (includeArchived = false) => ['wallets', 'list', { includeArchived }] as const, one: (id: string) => ['wallets', id] as const },
  transactions: { all: ['transactions'] as const, list: (f: object = {}) => ['transactions', 'list', f] as const, one: (id: string) => ['transactions', id] as const },
  categories: { all: ['categories'] as const, list: (type?: string) => ['categories', 'list', type ?? 'all'] as const, suggest: (note: string, amount?: number, type?: string) => ['categories', 'suggest', note, amount, type] as const },
  budgets: { all: ['budgets'] as const, list: (period?: string) => ['budgets', 'list', period ?? 'current'] as const },
  goals: { all: ['goals'] as const, contributions: (id: string) => ['goals', id, 'contributions'] as const },
  recurring: { all: ['recurring-rules'] as const },
  notifications: { all: ['notifications'] as const, list: (f: object = {}) => ['notifications', 'list', f] as const, unread: ['notifications', 'unread'] as const, settings: ['notification-settings'] as const },
  reports: {
    all: ['reports'] as const,
    dashboard: (period?: string) => ['reports', 'dashboard', period ?? 'current'] as const,
    byCategory: (period?: string, type = 'EXPENSE') => ['reports', 'by-category', period ?? 'current', type] as const,
    trend: (months: number) => ['reports', 'trend', months] as const,
    topNotes: (period?: string, type = 'EXPENSE') => ['reports', 'top-notes', period ?? 'current', type] as const,
    daily: (period?: string) => ['reports', 'daily', period ?? 'current'] as const,
  },
  sessions: ['sessions'] as const,
  admin: {
    stats: ['admin', 'stats'] as const, users: (q: object = {}) => ['admin', 'users', q] as const, growth: (months: number) => ['admin', 'growth', months] as const,
    categories: ['admin', 'categories'] as const, rules: ['admin', 'rules'] as const, plans: ['admin', 'plans'] as const,
  },
};
