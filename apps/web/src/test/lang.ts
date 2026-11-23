import { act } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import { useUi } from '@/stores/ui';

/** switch the UI language (store + i18next) for one test; call the returned function (or `resetLang`) afterwards */
export function setLang(l: 'vi' | 'en') {
  act(() => { useUi.setState({ language: l }); });
  void i18n.changeLanguage(l);
}
export const resetLang = () => setLang('vi');
