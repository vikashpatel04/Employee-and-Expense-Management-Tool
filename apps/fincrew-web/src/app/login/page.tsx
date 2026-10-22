import { t } from '@/lib/i18n';
import { AuthCard } from '../components';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <AuthCard title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      <LoginForm
        labels={{
          email: t('auth.email'),
          password: t('auth.password'),
          signIn: t('auth.signIn'),
          signingIn: t('auth.signingIn'),
        }}
      />
    </AuthCard>
  );
}
