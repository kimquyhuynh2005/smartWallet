import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto max-w-xl p-6 pt-16">
      <h1 className="sr-only">{t('errors.pageNotFound')}</h1>
      <EmptyState icon={Compass} title={t('errors.pageNotFound')} action={<Link to="/dashboard" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('nav.home')}</Link>}>{t('errors.pageNotFoundHint')}</EmptyState>
    </main>
  );
}
