import { useRouter } from "expo-router";

import { AuthFooter, AuthScreen } from "@/components/auth-screen";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/services/auth-context";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  return (
    <AuthScreen
      mode="signIn"
      title="Welcome back"
      subtitle="Care follows wherever your pet goes."
      submitLabel="Sign In"
      onBack={() => goBack("/")}
      onForgotPassword={() => router.push("/reset-password")}
      onSubmit={async ({ accountType, email, password }) => {
        await signIn(
          email,
          password,
          accountType === "vet" ? "CLINIC" : "OWNER",
        );
        router.replace(
          accountType === "vet" ? "/clinic-dashboard" : "/dashboard",
        );
      }}
      footer={
        <AuthFooter
          text="New here? "
          linkLabel="Create an account"
          onPress={() => router.push("/create-account")}
        />
      }
    />
  );
}
