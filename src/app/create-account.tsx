import { useRouter } from 'expo-router';

import { AuthFooter, AuthScreen } from '@/components/auth-screen';
import { goBack } from '@/lib/navigation';

const ClinicNote =
  'Clinic accounts are verified. Submit your clinic email and the Pet-Connect team will review access.';

export default function CreateAccountScreen() {
  const router = useRouter();

  return (
    <AuthScreen
      title="Join the network"
      subtitle="Care follows wherever your pet goes."
      submitLabel="Create Account"
      showFullName
      showConfirmPassword
      clinicNote={ClinicNote}
      onBack={() => goBack('/')}
      onSubmit={(type) =>
        router.push(type === 'vet' ? '/vet-details' : '/owner-details')
      }
      footer={
        <AuthFooter
          text="Already have an account? "
          linkLabel="Sign in"
          onPress={() => goBack('/sign-in')}
        />
      }
    />
  );
}
