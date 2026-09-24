import { useRouter } from "expo-router";
import { useState } from "react";

import {
    AuthFooter,
    AuthScreen,
    type AuthFormValues,
} from "@/components/auth-screen";
import { goBack } from "@/lib/navigation";
import { register } from "@/lib/session";

const ClinicNote =
  "Clinic accounts are verified. Submit your clinic email and the Pet-Connect team will review access.";

export default function CreateAccountScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: AuthFormValues) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        accountType: values.accountType,
      });
      router.replace(
        values.accountType === "vet" ? "/vet-details" : "/owner-details",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to create your account right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Join the network"
      subtitle="Care follows wherever your pet goes."
      submitLabel={submitting ? "Creating Account…" : "Create Account"}
      showFullName
      showConfirmPassword
      allowClinicAccountType={false}
      error={error}
      onBack={() => goBack("/")}
      onSubmit={handleSubmit}
      footer={
        <AuthFooter
          text="Already have an account? "
          linkLabel="Sign in"
          onPress={() => goBack("/sign-in")}
        />
      }
    />
  );
}
