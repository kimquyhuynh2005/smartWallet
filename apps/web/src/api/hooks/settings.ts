import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

// Security settings. NOT in the real API yet (docs/backend-requests.md #8 and the sessions row): mocked.
/** POST /me/password; a wrong current password answers 400 WRONG_PASSWORD; the API should revoke the other sessions */
export const useChangePassword = () => useMutation({ mutationFn: (b: Parameters<typeof endpoints.me.changePassword>[0]) => endpoints.me.changePassword(b), meta: { silent: true } });
export const useSessions = () => useQuery({ queryKey: qk.sessions, queryFn: endpoints.me.sessions, retry: false });
export function useRevokeSession() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.me.revokeSession(id), onSuccess: () => inv(qk.sessions) }); }
export function useRevokeOtherSessions() { const inv = useInvalidate(); return useMutation({ mutationFn: () => endpoints.me.revokeOtherSessions(), onSuccess: () => inv(qk.sessions) }); }
