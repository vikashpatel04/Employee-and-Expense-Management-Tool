import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@fincrew/core';
import { createI18n } from './index';

describe('English strings', () => {
  const i18n = createI18n('en');

  it('label every permission and its area (roles screen)', () => {
    for (const key of PERMISSIONS) {
      expect(i18n.exists(`permissions.${key}`), key).toBe(true);
      expect(typeof i18n.t(`permissions.${key}`), key).toBe('string');
      expect(i18n.exists(`permissionAreas.${key.split('.')[0]}`), key).toBe(true);
    }
  });
});
