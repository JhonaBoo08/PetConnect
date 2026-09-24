import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  type ClinicPreferences,
  updateClinicPreferences,
  useClinicPreferences,
} from '@/lib/clinic';
import { goBack } from '@/lib/navigation';

type ToggleRowProps = {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function ToggleRow({ label, hint, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Palette.borderSoft, true: Palette.gold }}
        thumbColor={Palette.forestDark}
      />
    </View>
  );
}

export default function ClinicPreferencesScreen() {
  const router = useRouter();
  const prefs = useClinicPreferences();
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = async (key: keyof ClinicPreferences, value: boolean) => {
    setSaveError(null);
    try {
      await updateClinicPreferences({ [key]: value });
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : 'Unable to save preferences. Please try again.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/clinic-profile')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · PROFILE</Text>
          <Text style={styles.heading}>Preferences</Text>
          <Text style={styles.supporting}>
            Choose which clinic updates and alerts appear in your workspace.
          </Text>

          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

          <Text style={styles.sectionLabel}>ALERTS</Text>
          <View style={styles.section}>
            <ToggleRow
              label="Access request alerts"
              hint="Notify when a pet owner sends an access request."
              value={prefs.accessRequestAlerts}
              onValueChange={(value) => void toggle('accessRequestAlerts', value)}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Health record activity"
              hint="Get updates when records are added for your clinic."
              value={prefs.recordAlerts}
              onValueChange={(value) => void toggle('recordAlerts', value)}
            />
          </View>
        </ScrollView>

        <BottomNav variant="clinic" active="profile" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
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
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.three,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  section: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 15,
    paddingHorizontal: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  toggleHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.borderSoft,
  },
  pressed: {
    opacity: 0.85,
  },
});