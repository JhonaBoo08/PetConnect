import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CameraIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';
import {
  maskPhone,
  roleLabel,
  type Preferences,
  updatePreferences,
  useSession,
} from '@/lib/session';

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function permissionLabel(status: string): string {
  if (status === 'granted') return 'Granted';
  if (status === 'denied') return 'Denied';
  if (status === 'undetermined') return 'Not requested';
  return status;
}

export default function PreferencesScreen() {
  const { user, preferences, ready } = useSession();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState('checking');
  const [cameraPermission, setCameraPermission] = useState('checking');
  const [notificationPermission, setNotificationPermission] = useState('checking');
  const [cameraPerm] = useCameraPermissions();

  useEffect(() => {
    if (cameraPerm) setCameraPermission(cameraPerm.status);
  }, [cameraPerm]);

  useEffect(() => {
    if (ready && preferences) setDraft(preferences);
  }, [ready, preferences]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const location = await Location.getForegroundPermissionsAsync();
        if (active) setLocationPermission(location.status);
      } catch {
        if (active) setLocationPermission('unavailable');
      }
      if (Platform.OS === 'web' && typeof Notification !== 'undefined') {
        if (active) setNotificationPermission(Notification.permission ?? 'undetermined');
      } else if (active) {
        setNotificationPermission('device-settings');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (key: keyof Preferences, value: boolean) => {
    if (!draft) return;
    const previous = draft;
    const next = { ...draft };
    next[key] = value;
    setDraft(next);
    setSaveError(null);
    try {
      await updatePreferences({ [key]: value });
    } catch (e) {
      setDraft(previous);
      setSaveError(
        e instanceof Error ? e.message : 'Unable to save preferences. Please try again.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/profile')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => goBack('/notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>ACCOUNT</Text>
          <Text style={styles.heading}>Preferences</Text>
          <Text style={styles.supporting}>
            Control what you’re notified about, how your pet’s recovery details are shared, and
            which permissions the app may use.
          </Text>

          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.section}>
            <ToggleRow
              label="Health reminders"
              hint="Vaccines, boosters, and vet follow-ups."
              value={draft?.healthReminders ?? true}
              onValueChange={(value) => toggle('healthReminders', value)}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Lost pet alerts"
              hint="Alerts when a pet is reported lost nearby."
              value={draft?.lostPetAlerts ?? true}
              onValueChange={(value) => toggle('lostPetAlerts', value)}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Nearby recovery alerts"
              hint="See recovery reports shared near your area."
              value={draft?.nearbyRecoveryAlerts ?? true}
              onValueChange={(value) => toggle('nearbyRecoveryAlerts', value)}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Clinic updates"
              hint="Verified records and clinic announcements."
              value={draft?.clinicUpdates ?? true}
              onValueChange={(value) => toggle('clinicUpdates', value)}
            />
          </View>

          <Text style={styles.sectionLabel}>PRIVACY</Text>
          <View style={styles.section}>
            <ToggleRow
              label="Show recovery contact"
              hint="Let someone who scans your pet’s QR see the recovery-safe contact."
              value={draft?.showRecoveryContact ?? true}
              onValueChange={(value) => toggle('showRecoveryContact', value)}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Share nearby visibility"
              hint="Allow nearby recovery alerts to include your pet’s location."
              value={draft?.nearbyVisibility ?? true}
              onValueChange={(value) => toggle('nearbyVisibility', value)}
            />
          </View>

          <Text style={styles.sectionLabel}>PERMISSIONS</Text>
          <View style={styles.section}>
            <InfoRow label="Location access" value={permissionLabel(locationPermission)} />
            <View style={styles.divider} />
            <InfoRow label="Camera access" value={permissionLabel(cameraPermission)} />
            <View style={styles.divider} />
            <InfoRow
              label="Notification access"
              value={
                notificationPermission === 'default' || notificationPermission === 'undetermined'
                  ? 'Not requested'
                  : notificationPermission === 'device-settings'
                    ? 'Check device settings'
                    : notificationPermission === 'granted'
                      ? 'Granted'
                      : notificationPermission
              }
            />
          </View>

          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.section}>
            <InfoRow label="Email address" value={user?.email ?? '—'} />
            <View style={styles.divider} />
            <InfoRow
              label="Phone number"
              value={user?.phoneNumber ? maskPhone(user.phoneNumber) : 'Not set'}
            />
            <View style={styles.divider} />
            <InfoRow
              label="Account type"
              value={user ? roleLabel(user.accountType) : '—'}
            />
          </View>

          <View style={styles.privacyNote}>
            <CameraIcon size={20} color={Palette.forestDark} />
            <Text style={styles.privacyText}>
              Permissions are requested only when needed, and you can always review them in your
              device settings.
            </Text>
          </View>
        </ScrollView>

        <BottomNav active="profile" />
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
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.gold,
    borderWidth: 1.5,
    borderColor: Palette.surface,
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
    fontSize: 28,
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
    fontSize: 13,
    lineHeight: 18,
    color: Palette.danger,
    backgroundColor: Palette.goldSoft,
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Palette.forestDark,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  section: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: 2,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  infoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  infoValue: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.inkMuted,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: Palette.borderSoft,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.five,
    backgroundColor: Palette.sage,
    borderRadius: 12,
    padding: Spacing.three,
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
});