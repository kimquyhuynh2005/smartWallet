import { Info, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { endpoints } from '@/lib/api/endpoints';
import { session } from '@/lib/api/session';
import { USE_MOCKS } from '@/lib/realtime';
import { DEMO } from '@/mocks/demo';
import { toast, useUi } from '@/stores/ui';
import { vnDayKey } from '@/lib/format';
import {
  Alert, AmountText, Avatar, Badge, Button, Card, CategoryIcon, DatePicker, Dialog, EmptyState, Field, Input, MoneyInput, ProgressBar, ResponsiveDialog, Select, Sheet, Skeleton, Spinner,
  Switch, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/ui';

const SWATCHES = ['paper', 'surface', 'sunken', 'ink', 'ink-2', 'ink-3', 'line', 'line-strong', 'accent', 'accent-soft', 'warn', 'warn-soft', 'danger', 'danger-soft'] as const;
const CATS: { nameEn: string; nameVi: string; type: 'INCOME' | 'EXPENSE' }[] = [
  { nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE' }, { nameEn: 'Transport', nameVi: 'Di chuyển', type: 'EXPENSE' }, { nameEn: 'Housing', nameVi: 'Nhà ở', type: 'EXPENSE' },
  { nameEn: 'Bills', nameVi: 'Hóa đơn', type: 'EXPENSE' }, { nameEn: 'Shopping', nameVi: 'Mua sắm', type: 'EXPENSE' }, { nameEn: 'Entertainment', nameVi: 'Giải trí', type: 'EXPENSE' },
  { nameEn: 'Education', nameVi: 'Học tập', type: 'EXPENSE' }, { nameEn: 'Health', nameVi: 'Sức khỏe', type: 'EXPENSE' }, { nameEn: 'Gifts', nameVi: 'Quà tặng', type: 'EXPENSE' },
  { nameEn: 'Other', nameVi: 'Khác', type: 'EXPENSE' }, { nameEn: 'Salary', nameVi: 'Lương', type: 'INCOME' }, { nameEn: 'Allowance', nameVi: 'Tiền được cho', type: 'INCOME' },
  { nameEn: 'Part-time', nameVi: 'Làm thêm', type: 'INCOME' }, { nameEn: 'Bonus', nameVi: 'Thưởng', type: 'INCOME' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 id={id} className="text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
const Row = ({ children, label }: { children: ReactNode; label?: string }) => (
  <div className="flex flex-col gap-2">{label && <p className="eyebrow">{label}</p>}<div className="flex flex-wrap items-center gap-3">{children}</div></div>
);

export default function UiKit() {
  const { t } = useTranslation();
  const [money, setMoney] = useState<number | null>(1_500_000);
  const [date, setDate] = useState(vnDayKey(new Date()));
  const [sw, setSw] = useState(true);
  const [dialog, setDialog] = useState<'dialog' | 'sheet' | 'responsive' | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const openUpgrade = useUi((s) => s.openUpgrade);
  const push = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString('vi-VN')}  ${m}`, ...l].slice(0, 6));

  async function signInAndCall(expire: boolean) {
    try {
      if (!session.get()) { const r = await endpoints.auth.login({ email: DEMO.linh.email, password: DEMO.linh.password }); session.set(r.accessToken); push('signed in as Linh'); }
      if (expire) { const { mockControls } = await import('@/mocks/browser'); mockControls.expireTokens(); push('token expired on the server'); }
      const me = await endpoints.me.get();
      push(`GET /me -> ${me.fullName} (silent refresh ${expire ? 'happened' : 'not needed'})`);
    } catch (e) { push(`error: ${(e as Error).message}`); }
  }
  async function simulateOffline() {
    const { mockControls } = await import('@/mocks/browser');
    mockControls.setServerDown(true);
    try { await endpoints.wallets.list(); } catch { push('network error -> offline banner'); }
    setTimeout(() => { mockControls.setServerDown(false); void endpoints.wallets.list().catch(() => undefined); push('server back'); }, 2500);
  }

  return (
    <div className="flex flex-col gap-10 pb-16">
      <header>
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">{t('dev.title')}</h1>
        <p className="mt-1 max-w-prose text-base text-ink-2">{t('dev.intro')}</p>
      </header>

      <Section id="tokens" title={t('dev.tokens')}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <li key={s} className="flex items-center gap-2 rounded-md border border-line p-2"><span className="h-8 w-8 shrink-0 rounded-sm border border-line" style={{ background: `rgb(var(--${s}))` }} aria-hidden /><span className="truncate text-xs text-ink-2">{s}</span></li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 rounded-lg border border-line p-4">
          <p className="text-3xl font-semibold text-ink">36 · Nguyễn Thị Thu Hằng</p>
          <p className="text-2xl font-semibold text-ink">28 · Ơ ờ ữ ặ ẳ ỡ ụ ỵ</p>
          <p className="text-xl font-semibold text-ink">22 · Tháng 11/2026 — lương tháng 10</p>
          <p className="text-lg font-semibold text-ink">18 · Cà phê Highlands, Grab đi làm</p>
          <p className="text-base text-ink">16 · Tiền nhà tháng 11 được thanh toán qua MoMo lúc 08:30.</p>
          <p className="text-sm text-ink-2">14 · Ghi chú phụ, mô tả ngắn gọn cho một giao dịch.</p>
          <p className="text-xs text-ink-3">12 · Chú thích nhỏ, không dùng cho thông tin quan trọng.</p>
          <p className="num mt-2 text-xl text-ink">1.111.111 · 0.000.000 · 1.234.567 ₫ (tabular)</p>
        </div>
      </Section>

      <Section id="buttons" title={t('dev.buttons')}>
        <Row label="variants"><Button>{t('dev.primary')}</Button><Button variant="secondary">{t('dev.secondary')}</Button><Button variant="ghost">{t('dev.ghost')}</Button><Button variant="destructive"><Trash2 className="h-4 w-4" aria-hidden />{t('dev.destructive')}</Button></Row>
        <Row label="sizes / icon"><Button size="sm">sm</Button><Button size="md">md</Button><Button size="lg">lg</Button><Button size="icon" variant="secondary" aria-label={t('common.add')}><Plus className="h-5 w-5" aria-hidden /></Button></Row>
        <Row label="states"><Button loading>{t('dev.loading')}</Button><Button disabled>{t('common.save')}</Button><Button variant="secondary" loading>{t('dev.loading')}</Button>
          <Button loading={saving} onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500); }}>{t('common.save')}</Button></Row>
      </Section>

      <Section id="inputs" title={t('dev.inputs')}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t('auth.email')} hint="linh@smartwallet.demo"><Input type="email" placeholder="ban@vidu.vn" /></Field>
          <Field label={t('auth.password')} error={t('errors.validation')} required><Input type="password" defaultValue="abc" /></Field>
          <Field label={t('quickAdd.amount')} hint={`${money ?? 0} (integer)`}><MoneyInput value={money} onChange={setMoney} /></Field>
          <Field label={t('quickAdd.amount')} error={t('quickAdd.amountRequired')}><MoneyInput value={null} onChange={() => undefined} invalid /></Field>
          <Field label={t('quickAdd.category')}><Select placeholder={t('quickAdd.categoryPlaceholder')} options={CATS.filter((c) => c.type === 'EXPENSE').map((c) => ({ value: c.nameEn, label: c.nameVi }))} /></Field>
          <Field label={t('quickAdd.date')}><DatePicker value={date} onChange={setDate} /></Field>
          <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3 md:col-span-2"><span className="text-base text-ink">{t('settings.weeklySummary')}</span><Switch label={t('settings.weeklySummary')} checked={sw} onChange={setSw} /></div>
        </div>
      </Section>

      <Section id="data" title={t('dev.data')}>
        <Row label="AmountText"><AmountText amount={28_000_000} kind="income" /><AmountText amount={1_850_000} kind="expense" /><AmountText amount={2_000_000} kind="transfer" /><AmountText amount={-350_000} kind="balance" /><AmountText amount={17_903_000} kind="balance" size="hero" /></Row>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><ProgressBar percent={42} label="Ăn uống" /></Card>
          <Card><ProgressBar percent={88} label="Mua sắm" /></Card>
          <Card><ProgressBar percent={112} label="Di chuyển" /></Card>
        </div>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {CATS.map((c) => (<li key={c.nameEn + c.type} className="flex items-center gap-3 py-1"><CategoryIcon category={c} /><span className="text-base text-ink">{c.nameVi}</span><span className="text-sm text-ink-3">{c.nameEn}</span></li>))}
          <li className="flex items-center gap-3 py-1"><CategoryIcon category={{ nameEn: 'Pets', nameVi: 'Thú cưng', color: '#6D8F5E' }} /><span className="text-base text-ink">Thú cưng</span><span className="text-sm text-ink-3">custom</span></li>
          <li className="flex items-center gap-3 py-1"><CategoryIcon transfer /><span className="text-base text-ink">Chuyển ví</span><span className="text-sm text-ink-3">transfer</span></li>
        </ul>
        <Row label="Avatar"><Avatar name="Nguyễn Thị Thu Hằng" size="lg" /><Avatar name="Trần Văn Minh" /><Avatar name="Linh" size="sm" /><Avatar name="Broken" src="https://invalid.example/x.png" /></Row>
        <Row label="Badge"><Badge>Free</Badge><Badge tone="accent">Premium</Badge><Badge tone="warn" icon={<Info />}>Gần hết</Badge><Badge tone="danger" icon={<Info />}>Vượt ngân sách</Badge></Row>
        <Tabs defaultValue="a">
          <TabsList><TabsTrigger value="a">Tuần</TabsTrigger><TabsTrigger value="b">Tháng</TabsTrigger><TabsTrigger value="c">Quý</TabsTrigger></TabsList>
          <TabsContent value="a" className="text-ink-2">underline tabs</TabsContent><TabsContent value="b" className="text-ink-2">Tháng này</TabsContent><TabsContent value="c" className="text-ink-2">Quý này</TabsContent>
        </Tabs>
        <Tabs defaultValue="a"><TabsList variant="segmented"><TabsTrigger value="a">{t('common.all')}</TabsTrigger><TabsTrigger value="b">{t('transactions.expense')}</TabsTrigger><TabsTrigger value="c">{t('transactions.income')}</TabsTrigger></TabsList></Tabs>
        <EmptyState icon={Plus} title={t('dev.emptyTitle')} action={<Button>{t('nav.add')}</Button>}>{t('dev.emptyBody')}</EmptyState>
      </Section>

      <Section id="feedback" title={t('dev.feedback')}>
        <div className="grid items-start gap-3 md:grid-cols-2">
          <Alert tone="info">{t('dev.sampleBody')}</Alert><Alert tone="success">{t('quickAdd.saved')}</Alert>
          <Alert tone="warning">{t('errors.network')}</Alert><Alert tone="danger">{t('errors.invalidCredentials')}</Alert>
        </div>
        <Row label="toast"><Button variant="secondary" onClick={() => toast.success(t('quickAdd.saved'))}>success</Button><Button variant="secondary" onClick={() => toast.info(t('dev.sampleTitle'), t('dev.sampleBody'))}>info</Button>
          <Button variant="secondary" onClick={() => toast.warning('Đã dùng 85% ngân sách Mua sắm')}>warning</Button><Button variant="secondary" onClick={() => toast.error('Đã dùng 112% ngân sách Di chuyển')}>error</Button>
          <Button variant="secondary" onClick={() => toast.show({ kind: 'info', title: t('dev.sampleTitle'), action: { label: t('common.retry'), onClick: () => undefined } })}>action</Button></Row>
        <Row label="loading"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-64" /><Spinner className="h-5 w-5 text-ink-2" /></Row>
        <Row label="api"><Button variant="secondary" onClick={() => openUpgrade({ key: 'max_wallets', limit: 3 })}>{t('dev.upgrade')}</Button>
          {USE_MOCKS && <><Button variant="secondary" onClick={() => void signInAndCall(false)}>GET /me</Button><Button variant="secondary" onClick={() => void signInAndCall(true)}>{t('dev.expireToken')}</Button><Button variant="secondary" onClick={() => void simulateOffline()}>{t('dev.offlineDemo')}</Button></>}</Row>
        {USE_MOCKS && <p className="text-sm text-ink-3">{t('dev.expireTokenHint')}</p>}
        {log.length > 0 && <pre className="num overflow-x-auto rounded-md border border-line bg-sunken p-3 text-xs text-ink-2" aria-live="polite">{log.join('\n')}</pre>}
      </Section>

      <Section id="overlays" title={t('dev.overlays')}>
        <Row><Button variant="secondary" onClick={() => setDialog('dialog')}>Dialog</Button><Button variant="secondary" onClick={() => setDialog('sheet')}>Sheet</Button><Button variant="secondary" onClick={() => setDialog('responsive')}>{t('dev.openDialog')}</Button></Row>
        {(['dialog', 'sheet', 'responsive'] as const).map((k) => {
          const C = k === 'dialog' ? Dialog : k === 'sheet' ? Sheet : ResponsiveDialog;
          return (
            <C key={k} open={dialog === k} onOpenChange={(o) => !o && setDialog(null)} title={t('quickAdd.title')} description={t('dev.sampleBody')} footer={<><Button onClick={() => setDialog(null)}>{t('common.done')}</Button><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button></>}>
              <Field label={t('quickAdd.amount')}><MoneyInput value={money} onChange={setMoney} /></Field>
            </C>
          );
        })}
      </Section>
    </div>
  );
}
