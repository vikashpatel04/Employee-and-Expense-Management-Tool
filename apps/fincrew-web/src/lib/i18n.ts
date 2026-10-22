import { createI18n } from '@fincrew/i18n';

// English only for now; language choice comes with translations (Phase 8).
const i18n = createI18n('en');

export const t = i18n.t.bind(i18n);
