import { t } from '@/lib/i18n';
import { AuthCard } from '../components';
import { PasswordForm } from './password-form';

/**
 * "Choose your password" (docs/features/helper-sign-in.md): shown instead of the app while the
 * sign-in still has the first password the shop gave (`must_change_password`).
 */
export default function PasswordPage() {
  return (
    <AuthCard title={t('password.title')} subtitle={t('password.subtitle')}>
      <PasswordForm
        labels={{
          password: t('password.new'),
          again: t('password.again'),
          save: t('password.save'),
          saving: t('password.saving'),
        }}
      />
    </AuthCard>
  );
}
