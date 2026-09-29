import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackArrow, GearIcon } from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  getPrivacySettings,
  updatePrivacySettings,
} from "@/services/auth";
import type { PrivacySettings } from "../../../shared/contracts";

type PrivacyKey = keyof PrivacySettings;

const options: {
  key: PrivacyKey;
  title: string;
  description: string;
}[] = [
  {
    key: "shareRecoveryPhone",
    title: "Show phone on public Pet ID",
    description:
      "Off by default. When enabled, someone who scans your active Pet ID can see your contact number.",
  },
  {
    key: "sharePreciseRecoveryLocation",
    title: "Share precise recovery location",
    description:
      "Off by default. When disabled, public lost-pet maps receive a coarsened location instead of the exact GPS point.",
  },
  {
    key: "sharePhoneWithClinics",
    title: "Share phone with clinics",
    description:
      "Controls whether an authenticated clinic that scans a valid Pet ID can see your phone number.",
  },
];

export default function PrivacySettingsScreen() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState<PrivacyKey | "">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setSettings(await getPrivacySettings());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError("");
      load().catch((cause) => {
        if (active) setError(authErrorMessage(cause));
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function toggle(key: PrivacyKey, value: boolean) {
    if (!settings || saving) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(key);
    setError("");
    try {
      setSettings(await updatePrivacySettings({ [key]: value }));
    } catch (cause) {
      setSettings(previous);
      setError(authErrorMessage(cause));
    } finally {
      setSaving("");
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
            onPress={() => goBack("/profile")}
            style={styles.backButton}
          >
            <BackArrow />
          </Pressable>

          <View style={styles.icon}>
            <GearIcon />
          </View>
          <Text style={styles.eyebrow}>PRIVACY</Text>
          <Text style={styles.heading}>Control what PetConnect shares</Text>
          <Text style={styles.supporting}>
            Health records remain authenticated. These controls only change
            contact and location details that can leave your owner account.
          </Text>

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {!settings ? (
            <ActivityIndicator
              size="large"
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : (
            <View style={styles.list}>
              {options.map((option) => (
                <View key={option.key} style={styles.card}>
                  <View style={styles.cardText}>
                    <Text style={styles.title}>{option.title}</Text>
                    <Text style={styles.description}>
                      {option.description}
                    </Text>
                  </View>
                  <View style={styles.switchWrap}>
                    {saving === option.key ? (
                      <ActivityIndicator color={Palette.forestDark} />
                    ) : (
                      <Switch
                        accessibilityLabel={option.title}
                        value={settings[option.key]}
                        onValueChange={(value) =>
                          void toggle(option.key, value)
                        }
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.note}>
            <Text style={styles.noteTitle}>Privacy defaults</Text>
            <Text style={styles.noteText}>
              Public phone and precise GPS sharing start off. Clinic phone
              sharing starts on because clinics may need to coordinate a visit,
              and you can turn it off here at any time.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  backButton: {
    marginTop: Spacing.two,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginTop: Spacing.four,
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.inkMuted,
  },
  heading: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  supporting: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
  },
  error: {
    marginTop: Spacing.three,
    color: Palette.danger,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  loader: {
    marginTop: Spacing.five,
  },
  list: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    minHeight: 112,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  cardText: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  description: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  switchWrap: {
    width: 52,
    alignItems: "center",
  },
  note: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.goldSoft,
  },
  noteTitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  noteText: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
});
