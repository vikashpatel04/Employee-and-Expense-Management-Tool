import i18next, { type i18n } from 'i18next';
import enCommon from './locales/en/common.json';

export const defaultNS = 'common';
export const resources = {
  en: { common: enCommon },
} as const;

export const supportedLanguages = ['en'] as const; // 'ta', 'hi' later
export type Language = (typeof supportedLanguages)[number];

/** Create an initialised i18next instance. Apps wrap it with their own React binding. */
export function createI18n(lng: Language = 'en'): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    lng,
    fallbackLng: 'en',
    defaultNS,
    resources,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
