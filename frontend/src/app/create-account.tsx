import { useRouter } from "expo-router";

import { AuthFooter, AuthScreen } from "@/components/auth-screen";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/services/auth-context";

export default function CreateAccountScreen() {
  const router = useRouter();
  const { state, signUp, finishRegistration, signOut } = useAuth();
  const existingEmail = state.status === "setup" ? state.email : undefined;

  return (
    <AuthScreen
      mode="signUp"
      title="Join the network"
      subtitle="Care follows wherever your pet goes."
      submitLabel="Create Account"
      existingEmail={existingEmail}
      clinicNote="Clinic accounts are set up by the Pet-Connect team. If you already have credentials, sign in as Vet Clinic."
      onBack={() => {
        if (existingEmail) return signOut();
        goBack("/sign-in");
      }}
      onSubmit={async ({ email, password, displayName }) => {
        if (existingEmail) await finishRegistration({ displayName });
        else await signUp(email, password, { displayName });
      }}
      footer={
        <AuthFooter
          text={
            existingEmail
              ? "Use another account? "
              : "Already have an account? "
          }
          linkLabel={existingEmail ? "Sign out" : "Sign in"}
          onPress={() => {
            if (existingEmail) return signOut();
            router.replace("/sign-in");
          }}
        />
      }
    />
  );
}
