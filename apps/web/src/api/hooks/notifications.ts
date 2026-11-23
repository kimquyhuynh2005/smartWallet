import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Settings = Parameters<typeof endpoints.notifications.updateSettings>[0];
type ListQuery = Parameters<typeof endpoints.notifications.list>[0];

export const useNotifications = (q: ListQuery = {}) => useQuery({ queryKey: qk.notifications.list(q ?? {}), queryFn: () => endpoints.notifications.list(q) });
/** unread count without a dedicated endpoint: meta.total of ?unread=true&limit=1 */
export const useUnreadCount = () => useQuery({ queryKey: qk.notifications.unread, queryFn: () => endpoints.notifications.list({ unread: true, limit: 1 }), select: (r) => r.meta.total, meta: { silent: true } });
export function useMarkNotificationRead() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.notifications.markRead(id), onSuccess: () => inv(qk.notifications.all) }); }
export function useMarkAllNotificationsRead() { const inv = useInvalidate(); return useMutation({ mutationFn: () => endpoints.notifications.readAll(), onSuccess: () => inv(qk.notifications.all) }); }
export const useNotificationSettings = () => useQuery({ queryKey: qk.notifications.settings, queryFn: endpoints.notifications.settings });
export function useUpdateNotificationSettings() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Settings) => endpoints.notifications.updateSettings(b), onSuccess: () => inv(qk.notifications.settings) }); }
