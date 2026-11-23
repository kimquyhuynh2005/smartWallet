import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui';
import { PageHeader } from './parts';

/** Stand-in for a feature page that has not been built yet. The feature agent REPLACES the page file, never this component. */
export function ComingSoon({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <EmptyState icon={Hammer} title={t('nav.comingSoon')}>{t('nav.comingSoonHint')}</EmptyState>
    </>
  );
}
