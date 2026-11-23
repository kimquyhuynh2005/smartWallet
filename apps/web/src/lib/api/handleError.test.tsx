// @vitest-environment jsdom
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlanLimitDialogContent } from '@/features/plans/PlanLimitDialogContent';
import { PlanLimitDialog } from '@/app/PlanLimitDialog';
import { resetLang, setLang } from '@/test/lang';
import { useUi } from '@/stores/ui';
import { ApiError, API_URL } from './client';
import { handleGlobalError } from './handleError';
import { session } from './session';

const err = (code: string, status: number, details?: unknown) => new ApiError({ status, code, message: code, details });
const reset = () => useUi.setState({ toasts: [], upgrade: { open: false }, offline: false });

/** a client wired exactly like src/lib/queryClient.ts, minus retries so errors surface at once */
function makeClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (e, q) => handleGlobalError(e, { kind: 'query', silent: q.meta?.silent }) }),
    mutationCache: new MutationCache({ onError: (e, _v, _c, m) => handleGlobalError(e, { kind: 'mutation', silent: m.meta?.silent }) }),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
const toasts = () => useUi.getState().toasts;

describe('TC-FE-SUB-01 global error policy (handleGlobalError)', () => {
  beforeEach(reset);
  afterEach(() => { reset(); resetLang(); });

  it('TC-FE-SUB-01-01 PLAN_LIMIT_REACHED with {key, limit} opens the upgrade dialog (mutation)', async () => {
    const qc = makeClient();
    await qc.getMutationCache().build(qc, { mutationFn: async () => { throw err('PLAN_LIMIT_REACHED', 403, { key: 'max_wallets', limit: 3 }); } }).execute(undefined).catch(() => undefined);
    expect(useUi.getState().upgrade).toEqual({ open: true, reason: { key: 'max_wallets', limit: 3, feature: undefined } });
    expect(toasts()).toHaveLength(0);
  });

  it('TC-FE-SUB-01-02 PLAN_LIMIT_REACHED from a query opens the dialog too', async () => {
    const qc = makeClient();
    await qc.fetchQuery({ queryKey: ['x'], queryFn: async () => { throw err('PLAN_LIMIT_REACHED', 403, { key: 'history_months', limit: 6 }); } }).catch(() => undefined);
    expect(useUi.getState().upgrade.open).toBe(true);
    expect(useUi.getState().upgrade.reason).toMatchObject({ key: 'history_months', limit: 6 });
  });

  it('TC-FE-SUB-01-03 a premium feature (details.feature) opens the dialog with the feature', () => {
    handleGlobalError(err('PLAN_LIMIT_REACHED', 403, { feature: 'csv_export' }), { kind: 'mutation' });
    expect(useUi.getState().upgrade.reason).toMatchObject({ feature: 'csv_export' });
  });

  it('TC-FE-SUB-01-04 PLAN_LIMIT_REACHED without details still opens the (generic) dialog', () => {
    handleGlobalError(err('PLAN_LIMIT_REACHED', 403), { kind: 'mutation' });
    expect(useUi.getState().upgrade.open).toBe(true);
  });

  it('TC-FE-SUB-01-05 meta.silent suppresses everything (query and mutation)', async () => {
    const qc = makeClient();
    await qc.fetchQuery({ queryKey: ['s'], meta: { silent: true }, queryFn: async () => { throw err('PLAN_LIMIT_REACHED', 403, { key: 'max_wallets', limit: 3 }); } }).catch(() => undefined);
    await qc.getMutationCache().build(qc, { meta: { silent: true }, mutationFn: async () => { throw err('RATE_LIMITED', 429); } }).execute(undefined).catch(() => undefined);
    await qc.getMutationCache().build(qc, { meta: { silent: true }, mutationFn: async () => { throw err('INTERNAL', 500); } }).execute(undefined).catch(() => undefined);
    expect(useUi.getState().upgrade.open).toBe(false);
    expect(toasts()).toHaveLength(0);
  });

  it('TC-FE-SUB-01-06 NETWORK_ERROR from a mutation shows the networkSave warning toast', () => {
    handleGlobalError(err('NETWORK_ERROR', 0), { kind: 'mutation' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({ kind: 'warning', title: 'Chưa lưu được. Kiểm tra kết nối rồi thử lại nhé.' });
  });

  it('TC-FE-SUB-01-07 NETWORK_ERROR from a query shows nothing (the offline banner owns it)', () => {
    handleGlobalError(err('NETWORK_ERROR', 0), { kind: 'query' });
    expect(toasts()).toHaveLength(0);
  });

  it('TC-FE-SUB-01-08 networkSave toast is English in English', () => {
    setLang('en');
    handleGlobalError(err('NETWORK_ERROR', 0), { kind: 'mutation' });
    expect(toasts()[0].title).toBe("Couldn't save. Check your connection and try again.");
  });

  it('TC-FE-SUB-01-09 RATE_LIMITED shows the rate-limit warning toast (query and mutation)', () => {
    handleGlobalError(err('RATE_LIMITED', 429), { kind: 'query' });
    handleGlobalError(err('RATE_LIMITED', 429), { kind: 'mutation' });
    expect(toasts().map((t) => [t.kind, t.title])).toEqual([
      ['warning', 'Bạn thao tác hơi nhanh. Đợi vài giây rồi thử lại nhé.'],
      ['warning', 'Bạn thao tác hơi nhanh. Đợi vài giây rồi thử lại nhé.'],
    ]);
  });

  it('TC-FE-SUB-01-10 VALIDATION_ERROR / SESSION_EXPIRED / UNAUTHORIZED show nothing', () => {
    for (const kind of ['query', 'mutation'] as const) {
      handleGlobalError(err('VALIDATION_ERROR', 400, { fieldErrors: {} }), { kind });
      handleGlobalError(err('SESSION_EXPIRED', 401), { kind });
      handleGlobalError(err('UNAUTHORIZED', 401), { kind });
    }
    expect(toasts()).toHaveLength(0);
    expect(useUi.getState().upgrade.open).toBe(false);
  });

  it('TC-FE-SUB-01-11 5xx on a query shows an error toast with the server copy', () => {
    handleGlobalError(err('INTERNAL', 503), { kind: 'query' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({ kind: 'error', title: 'Máy chủ đang bận. Bạn thử lại sau ít phút nhé.' });
  });

  it('TC-FE-SUB-01-12 4xx on a query (e.g. 404) shows nothing; the same 4xx on a mutation shows an error toast', () => {
    handleGlobalError(err('NOT_FOUND', 404), { kind: 'query' });
    expect(toasts()).toHaveLength(0);
    handleGlobalError(err('NOT_FOUND', 404), { kind: 'mutation' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].kind).toBe('error');
  });

  it('TC-FE-SUB-01-13 non-ApiError values are ignored (no crash, no toast)', () => {
    handleGlobalError(new Error('boom'), { kind: 'mutation' });
    handleGlobalError('x', { kind: 'query' });
    expect(toasts()).toHaveLength(0);
  });
});

describe('TC-FE-SUB-01 PlanLimitDialogContent copy per limit key', () => {
  const server = setupServer(
    http.get(`${API_URL}/subscriptions/me`, () => HttpResponse.json({ data: { plan: 'FREE', currentPeriodEnd: null, limits: { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 }, usage: { wallets: 3, budgets: 4, goals: 1 } } })),
  );
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => server.close());
  beforeEach(() => { session.set('tok'); reset(); });
  afterEach(() => { server.resetHandlers(); session.clear(); resetLang(); });

  const show = (reason: Parameters<typeof PlanLimitDialogContent>[0]['reason']) => {
    const onClose = () => undefined;
    return render(
      <QueryClientProvider client={makeClient()}><MemoryRouter><PlanLimitDialogContent open reason={reason} onClose={onClose} /></MemoryRouter></QueryClientProvider>,
    );
  };

  it.each([
    ['max_wallets', 3, 'Bạn đang dùng 3/3 ví của gói Miễn phí. Cần thêm thì Premium không giới hạn số ví.'],
    ['max_budgets', 5, 'Bạn đang dùng 5/5 ngân sách mỗi kỳ của gói Miễn phí. Premium cho tạo thêm không giới hạn.'],
    ['max_goals', 2, 'Bạn đang dùng 2/2 mục tiêu của gói Miễn phí. Premium không giới hạn mục tiêu.'],
    ['history_months', 6, 'Gói Miễn phí xem được báo cáo của 6 tháng gần nhất. Premium mở toàn bộ lịch sử.'],
  ])('TC-FE-SUB-01-14 %s shows its own copy and the "Xem các gói" link', async (key, limit, copy) => {
    show({ key, limit });
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Tính năng của Premium' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem các gói' })).toHaveAttribute('href', '/plans');
    expect(screen.getByRole('button', { name: /Nâng cấp Premium/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeInTheDocument();
  });

  it.each([
    ['csv_export', 'Xuất báo cáo ra tệp CSV có trong gói Premium.'],
    ['csv_import', 'Nhập giao dịch từ tệp CSV có trong gói Premium.'],
    ['alert_thresholds', 'Tự chọn mốc cảnh báo cho từng ngân sách có trong gói Premium.'],
  ])('TC-FE-SUB-01-15 premium feature %s shows the feature copy', async (feature, copy) => {
    show({ feature });
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem các gói' })).toHaveAttribute('href', '/plans');
  });

  it('TC-FE-SUB-01-16 unknown reason falls back to the generic copy', async () => {
    show({ feature: 'something_new' });
    expect(await screen.findByText('Tính năng này có trong gói Premium.')).toBeInTheDocument();
    show(null);
    expect(await screen.findAllByText('Tính năng này có trong gói Premium.')).not.toHaveLength(0);
  });

  it('TC-FE-SUB-01-17 shows the current usage line for a count limit (3/3 ví)', async () => {
    show({ key: 'max_wallets', limit: 3 });
    expect(await screen.findByText('Bạn đang dùng 3/3 ví.')).toBeInTheDocument();
  });

  it('TC-FE-SUB-01-18 lists the three Premium benefits and the mock-checkout note', async () => {
    show({ key: 'max_goals', limit: 2 });
    expect(await screen.findByText('Không giới hạn ví, ngân sách và mục tiêu')).toBeInTheDocument();
    expect(screen.getByText('Xem báo cáo toàn bộ lịch sử, xuất CSV')).toBeInTheDocument();
    expect(screen.getByText('Tự chọn mốc cảnh báo ngân sách')).toBeInTheDocument();
    expect(screen.getByText('Đây là bản dùng thử, không thu tiền thật.')).toBeInTheDocument();
  });

  it('TC-FE-SUB-01-19 English copy for max_wallets', async () => {
    setLang('en');
    show({ key: 'max_wallets', limit: 3 });
    expect(await screen.findByRole('link', { name: /see.*plans/i })).toHaveAttribute('href', '/plans');
  });

  it('TC-FE-SUB-01-20 "Để sau" closes (calls onClose); the link also closes', async () => {
    let closed = 0;
    render(<QueryClientProvider client={makeClient()}><MemoryRouter><PlanLimitDialogContent open reason={{ key: 'max_wallets', limit: 3 }} onClose={() => { closed++; }} /></MemoryRouter></QueryClientProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Để sau' }));
    expect(closed).toBe(1);
    await userEvent.click(screen.getByRole('link', { name: 'Xem các gói' }));
    expect(closed).toBe(2);
  });

  it('TC-FE-SUB-01-21 error path: the plan query failing (500) still shows the copy and does not toast (silent meta)', async () => {
    server.use(http.get(`${API_URL}/subscriptions/me`, () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'x', details: null } }, { status: 500 })));
    show({ key: 'max_wallets', limit: 3 });
    expect(await screen.findByText(/Bạn đang dùng 3\/3 ví của gói Miễn phí/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText('Bạn đang dùng 3/3 ví.')).toBeNull();
  });
});

describe('TC-FE-SUB-01 shell PlanLimitDialog wiring', () => {
  const server = setupServer(
    http.get(`${API_URL}/subscriptions/me`, () => HttpResponse.json({ data: { plan: 'FREE', currentPeriodEnd: null, limits: { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 }, usage: { wallets: 3, budgets: 0, goals: 0 } } })),
  );
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => server.close());
  beforeEach(() => { session.set('tok'); reset(); });
  afterEach(() => { session.clear(); reset(); });

  it('TC-FE-SUB-01-22 renders nothing until openUpgrade, then the dialog; closing closes the store', async () => {
    render(<QueryClientProvider client={makeClient()}><MemoryRouter><PlanLimitDialog /></MemoryRouter></QueryClientProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    useUi.getState().openUpgrade({ key: 'max_budgets', limit: 5 });
    expect(await screen.findByRole('dialog', { name: 'Tính năng của Premium' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(useUi.getState().upgrade.open).toBe(false));
  });
});
