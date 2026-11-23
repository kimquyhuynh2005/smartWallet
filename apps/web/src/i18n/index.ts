import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useUi } from '@/stores/ui';
import vi from './locales/vi.json';
import en from './locales/en.json';
import viExtra from './locales/vi.extra.json';
import enExtra from './locales/en.extra.json';

/**
 * Two kinds of strings:
 *  - shell + shared screens (landing, auth, onboarding, nav, common ...): the default `translation` namespace (i18n/locales/*.json), owned by the shell.
 *  - one namespace PER FEATURE, from src/locales/{vi,en}/<feature>.json (file name = namespace): `useTranslation('budgets')`.
 *    A feature agent edits only its own pair of files. New feature files are picked up automatically by the glob below.
 */
const featureFiles = import.meta.glob('../locales/*/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
const features: Record<'vi' | 'en', Record<string, Record<string, unknown>>> = { vi: {}, en: {} };
for (const [path, data] of Object.entries(featureFiles)) {
  const m = /locales\/(vi|en)\/(.+)\.json$/.exec(path);
  if (m) features[m[1] as 'vi' | 'en'][m[2]] = data;
}
export const FEATURE_NAMESPACES = Object.keys(features.vi);

const lang = useUi.getState().language;

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: { ...vi, ...viExtra }, ...features.vi },
    en: { translation: { ...en, ...enExtra }, ...features.en },
  },
  lng: lang,
  fallbackLng: 'vi',
  defaultNS: 'translation',
  ns: ['translation', ...FEATURE_NAMESPACES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

const applyLang = (l: string) => {
  document.documentElement.lang = l;
  void i18n.changeLanguage(l);
};
applyLang(lang);
useUi.subscribe((s, prev) => { if (s.language !== prev.language) applyLang(s.language); });

export default i18n;
