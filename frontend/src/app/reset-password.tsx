import { useRouter } from "expo-router";

import { AuthFooter, AuthScreen } from "@/components/auth-screen";
import { goBack } from "@/lib/navigation";
import { resetPassword } from "@/services/auth";

export default function ResetPasswordScreen() {
  const router = useRouter();
  return (
    <AuthScreen
      mode="reset"
      title="Reset your password"
      subtitle="Enter your account email and we’ll send you a reset link."
      submitLabel="Send reset link"
      onBack={() => goBack("/sign-in")}
      onSubmit={async ({ email }) => {
        await resetPassword(email);
        return "If this email has an account, check your inbox for a reset link.";
      }}
      footer={
        <AuthFooter
          text="Remembered it? "
          linkLabel="Sign in"
          onPress={() => router.replace("/sign-in")}
        />
      }
    />
  );
}
