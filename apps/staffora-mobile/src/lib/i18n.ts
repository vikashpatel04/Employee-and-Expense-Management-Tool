import { createI18n } from '@fincrew/i18n';

// English for now, same strings as the website (Tamil and Hindi come with translations).
const i18n = createI18n('en');

export const t = i18n.t.bind(i18n);
