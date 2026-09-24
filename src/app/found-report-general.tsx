import { useRouter } from "expo-router";
import { useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackArrow, CheckIcon, SendIcon } from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { createFoundReport } from "@/lib/found-reports";
import { goBack } from "@/lib/navigation";

export default function GeneralFoundReportScreen() {
  const router = useRouter();
  const [where, setWhere] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!where.trim()) {
      setError("Please enter where you found the pet.");
      return;
    }
    setError("");
    await createFoundReport({
      alertId: null,
      petId: "",
      petName: "Unknown pet",
      ownerId: "",
      finderId: "finder-local-member",
      where: where.trim(),
      message: message.trim(),
      photo: "",
      status: "OPEN",
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.successIcon}>
              <CheckIcon size={28} color={Palette.white} />
            </View>
            <Text style={styles.title}>Report submitted</Text>
            <Text style={styles.supporting}>
              The report was saved for manual matching by the recovery network.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/")}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>Return home</Text>
            </Pressable>
          </View>
          <BottomNav active="home" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => goBack("/scan")}
            style={styles.backButton}
          >
            <BackArrow />
          </Pressable>
          <Text style={styles.category}>RECOVERY NETWORK</Text>
          <Text style={styles.title}>Report a found pet</Text>
          <Text style={styles.supporting}>
            No readable Pet-Connect QR? Share the location and details so an
            owner can identify the pet.
          </Text>

          <Text style={styles.label}>Where did you find the pet?</Text>
          <TextInput
            value={where}
            onChangeText={setWhere}
            placeholder="e.g. Mankilam, Tagum"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, error ? styles.inputInvalid : null]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Additional details</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Appearance, collar, or safe contact details"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <SendIcon size={17} color={Palette.forestDark} />
            <Text style={styles.primaryLabel}>Submit found-pet report</Text>
          </Pressable>
        </ScrollView>
        <BottomNav active="home" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.cream },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 120,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  inputInvalid: { borderColor: Palette.danger },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: Palette.gold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.five,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  pressed: { opacity: 0.75 },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.three,
  },
});
