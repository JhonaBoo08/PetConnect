import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthFooter, AuthScreen, type AuthFormValues } from '@/components/auth-screen';
import { getClinicProfileForUserId } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';
import { signIn } from '@/lib/session';

export default function SignInScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: AuthFormValues) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await signIn(values.email, values.password);
      if (user.accountType === 'vet') {
        const clinic = await getClinicProfileForUserId(user.userId);
        if (clinic && clinic.verificationStatus === 'verified') {
          router.replace('/clinic');
        } else {
          router.replace('/clinic-verification');
        }
      } else {
        router.replace('/dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Care follows wherever your pet goes."
      submitLabel={submitting ? 'Signing in…' : 'Sign In'}
      note="Demo owner: raven@petconnect.ph · Demo clinic: clinic@petconnect.ph · password: petconnect"
      error={error}
      onBack={() => goBack('/')}
      onSubmit={handleSubmit}
      footer={
        <AuthFooter
          text="New here? "
          linkLabel="Create an account"
          onPress={() => router.push('/create-account')}
        />
      }
    />
  );
}