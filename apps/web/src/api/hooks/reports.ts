import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';

/** All report hooks take the period from usePeriod().apiPeriod. Free plan: current + 5 earlier; older answers 403 PLAN_LIMIT_REACHED (history_months) -> global dialog. */
export const useDashboard = (period?: string) => useQuery({ queryKey: qk.reports.dashboard(period), queryFn: () => endpoints.reports.dashboard(period) });
export const useReportByCategory = (period?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') => useQuery({ queryKey: qk.reports.byCategory(period, type), queryFn: () => endpoints.reports.byCategory(period, type) });
/** Free: max 6 months */
export const useReportTrend = (months = 6) => useQuery({ queryKey: qk.reports.trend(months), queryFn: () => endpoints.reports.trend(months) });
export const useReportDaily = (period?: string) => useQuery({ queryKey: qk.reports.daily(period), queryFn: () => endpoints.reports.daily(period) });
/** Premium: resolves with the CSV text (BOM, formula-safe); the caller turns it into a download */
export const useExportCsv = () => useMutation({ mutationFn: (period?: string) => endpoints.reports.exportCsv(period) });
/** top notes / merchants of a period (mocked: docs/backend-requests.md, reports rows) */
export const useTopNotes = (period?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE', limit = 8) => useQuery({ queryKey: qk.reports.topNotes(period, type), queryFn: () => endpoints.reports.topNotes(period, type, limit) });
