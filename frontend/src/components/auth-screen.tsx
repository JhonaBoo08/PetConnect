import { Image } from "expo-image";
import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { Palette } from "@/constants/palette";
import { authErrorMessage } from "@/services/auth-context";

function BackArrow({
  size = 22,
  color = Palette.forestDark,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PawIcon({
  size = 16,
  color = Palette.forestDark,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={7} cy={8.5} r={2.4} />
      <Circle cx={12} cy={6.5} r={2.4} />
      <Circle cx={17} cy={8.5} r={2.4} />
      <Path d="M12 11.5c-3.2 0-5.6 2.1-5.6 4.5 0 1.7 1.3 2.9 3 2.9 1 0 1.7-.4 2.6-.4s1.6.4 2.6.4c1.7 0 3-1.2 3-2.9 0-2.4-2.4-4.5-5.6-4.5z" />
    </Svg>
  );
}

function VetIcon({
  size = 16,
  color = Palette.forestDark,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={10} y={3.5} width={4} height={17} rx={1.6} />
      <Rect x={3.5} y={10} width={17} height={4} rx={1.6} />
    </Svg>
  );
}

export function AuthFooter({
  text,
  linkLabel,
  onPress,
}: {
  text: string;
  linkLabel: string;
  onPress: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function handlePress() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onPress();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <View>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{text}</Text>
        <Pressable
          accessibilityRole="link"
          disabled={pending}
          onPress={() => void handlePress()}
        >
          <Text style={styles.footerLink}>{linkLabel}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export type AccountType = "owner" | "vet";
export type AuthValues = {
  accountType: AccountType;
  email: string;
  password: string;
  displayName: string;
};

type AuthScreenProps = {
  mode: "signIn" | "signUp" | "reset";
  title: string;
  subtitle: string;
  submitLabel: string;
  existingEmail?: string;
  clinicNote?: string;
  footer: ReactNode;
  onBack: () => void | Promise<void>;
  onForgotPassword?: () => void;
  onSubmit: (values: AuthValues) => Promise<void | string>;
};

export function AuthScreen({
  mode,
  title,
  subtitle,
  submitLabel,
  existingEmail,
  clinicNote,
  footer,
  onBack,
  onForgotPassword,
  onSubmit,
}: AuthScreenProps) {
  const [accountType, setAccountType] = useState<AccountType>("owner");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(existingEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const completing = mode === "signUp" && !!existingEmail;
  const clinicSignup = mode === "signUp" && accountType === "vet";

  async function submit() {
    if (pending || clinicSignup) return;
    setError("");
    setSuccess("");
    const address = (existingEmail || email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (
      mode === "signUp" &&
      (displayName.trim().length < 2 || displayName.trim().length > 80)
    ) {
      setError("Your name must be between 2 and 80 characters.");
      return;
    }
    if (mode !== "reset" && !completing && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signUp" && !completing && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({
        accountType,
        displayName: displayName.trim(),
        email: address,
        password,
      });
      if (result) setSuccess(result);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={10}
              onPress={() =>
                void Promise.resolve(onBack()).catch((cause) =>
                  setError(authErrorMessage(cause)),
                )
              }
              style={styles.backButton}
            >
              <BackArrow />
            </Pressable>

            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image
                  source={require("@/assets/images/logo.png")}
                  style={styles.brandMarkImage}
                  contentFit="contain"
                />
              </View>
              <View>
                <Text style={styles.brandName}>Pet-Connect</Text>
                <Text style={styles.brandTagline}>
                  SCAN · PROTECT · RECONNECT
                </Text>
              </View>
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>
                {completing ? "Finish your account" : title}
              </Text>
              <Text style={styles.subtitle}>
                {completing
                  ? "Your email is registered. Add your name to complete setup."
                  : subtitle}
              </Text>
            </View>

            {mode !== "reset" && !completing ? (
              <View style={styles.segment}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: accountType === "owner" }}
                  onPress={() => {
                    setAccountType("owner");
                    setError("");
                  }}
                  style={[
                    styles.segmentItem,
                    accountType === "owner" && styles.segmentItemActive,
                  ]}
                >
                  <PawIcon
                    color={
                      accountType === "owner" ? "#FFFFFF" : Palette.forestDark
                    }
                  />
                  <Text
                    style={[
                      styles.segmentLabel,
                      accountType === "owner" && styles.segmentLabelActive,
                    ]}
                  >
                    Pet Owner
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: accountType === "vet" }}
                  onPress={() => {
                    setAccountType("vet");
                    setError("");
                  }}
                  style={[
                    styles.segmentItem,
                    accountType === "vet" && styles.segmentItemActive,
                  ]}
                >
                  <VetIcon
                    color={
                      accountType === "vet" ? "#FFFFFF" : Palette.forestDark
                    }
                  />
                  <Text
                    style={[
                      styles.segmentLabel,
                      accountType === "vet" && styles.segmentLabelActive,
                    ]}
                  >
                    Vet Clinic
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {clinicSignup ? (
              <Text style={styles.clinicNote}>
                {clinicNote ||
                  "Clinic accounts are set up by the Pet-Connect team. If you have credentials, sign in as Vet Clinic."}
              </Text>
            ) : (
              <>
                <View style={styles.form}>
                  {mode === "signUp" ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>Full name</Text>
                      <TextInput
                        accessibilityLabel="Full name"
                        value={displayName}
                        onChangeText={(value) => {
                          setDisplayName(value);
                          setError("");
                        }}
                        placeholder="Your name"
                        placeholderTextColor={Palette.placeholder}
                        autoComplete="name"
                        style={styles.input}
                      />
                    </View>
                  ) : null}
                  <View style={styles.field}>
                    <Text style={styles.label}>Email address</Text>
                    <TextInput
                      accessibilityLabel="Email address"
                      value={existingEmail || email}
                      onChangeText={(value) => {
                        setEmail(value);
                        setError("");
                      }}
                      editable={!completing && !pending}
                      placeholder="you@example.com"
                      placeholderTextColor={Palette.placeholder}
                      keyboardType="email-address"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                    />
                  </View>
                  {mode !== "reset" && !completing ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        accessibilityLabel="Password"
                        value={password}
                        onChangeText={(value) => {
                          setPassword(value);
                          setError("");
                        }}
                        placeholder="At least 6 characters"
                        placeholderTextColor={Palette.placeholder}
                        secureTextEntry
                        autoComplete={
                          mode === "signUp"
                            ? "new-password"
                            : "current-password"
                        }
                        style={styles.input}
                      />
                    </View>
                  ) : null}
                  {mode === "signUp" && !completing ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>Confirm password</Text>
                      <TextInput
                        accessibilityLabel="Confirm password"
                        value={confirmPassword}
                        onChangeText={(value) => {
                          setConfirmPassword(value);
                          setError("");
                        }}
                        placeholder="Repeat your password"
                        placeholderTextColor={Palette.placeholder}
                        secureTextEntry
                        autoComplete="new-password"
                        style={styles.input}
                      />
                    </View>
                  ) : null}
                </View>

                {mode === "signIn" && onForgotPassword ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={onForgotPassword}
                    style={styles.inlineLink}
                  >
                    <Text style={styles.inlineLinkText}>Forgot password?</Text>
                  </Pressable>
                ) : null}
                {error ? (
                  <Text accessibilityRole="alert" style={styles.message}>
                    {error}
                  </Text>
                ) : null}
                {success ? (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.message, styles.success]}
                  >
                    {success}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: pending }}
                  disabled={pending}
                  onPress={() => void submit()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pending && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {pending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryLabel}>
                      {completing ? "Finish Account" : submitLabel}
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: "100%",
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandMarkImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  brandName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "600",
    color: Palette.inkMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  heading: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 29,
    lineHeight: 36,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: Palette.inkMuted,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: Palette.segmentTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.four,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: "#FFFFFF",
  },
  clinicNote: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    marginTop: Spacing.three,
  },
  form: {
    marginTop: Spacing.five,
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: Palette.forestDark,
  },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.five,
    shadowColor: "#1B4332",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.four,
  },
  footerText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
  },
  footerLink: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  inlineLink: {
    alignSelf: "flex-end",
    marginTop: Spacing.two,
  },
  inlineLinkText: {
    color: Palette.forestDark,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: "#9E342C",
  },
  success: {
    color: Palette.forestDark,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
});
