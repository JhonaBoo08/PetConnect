import { useRouter } from 'expo-router';

import { AuthFooter, AuthScreen } from '@/components/auth-screen';
import { goBack } from '@/lib/navigation';

export default function SignInScreen() {
  const router = useRouter();

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Care follows wherever your pet goes."
      submitLabel="Sign In"
      onBack={() => goBack('/')}
      onSubmit={() => router.push('/dashboard')}
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
