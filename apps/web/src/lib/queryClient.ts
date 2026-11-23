import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { handleGlobalError } from './api/handleError';
import { ApiError } from './api/client';

declare module '@tanstack/react-query' {
  interface Register { mutationMeta: { silent?: boolean }; queryMeta: { silent?: boolean } }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e, q) => handleGlobalError(e, { kind: 'query', silent: q.meta?.silent }) }),
  mutationCache: new MutationCache({ onError: (e, _v, _c, m) => handleGlobalError(e, { kind: 'mutation', silent: m.meta?.silent }) }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // never retry what the server already answered (4xx); retry flaky network / 5xx twice
      retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status > 0 && e.status < 500),
    },
  },
});
