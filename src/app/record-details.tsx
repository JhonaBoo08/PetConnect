import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, StethoscopeIcon, SyringeIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type RecordDetails = {
  id: string;
  type: 'vaccine' | 'checkup';
  name: string;
  pet: string;
  date: string;
  clinic: string;
  veterinarian: string;
  verified: boolean;
  notes: string;
  nextDue: string | null;
  boosterDue?: boolean;
};

const recordDetails: Record<string, RecordDetails> = {
  'anti-rabies': {
    id: 'anti-rabies',
    type: 'vaccine',
    name: 'Anti-Rabies',
    pet: 'Bantay',
    date: 'Aug 14, 2026',
    clinic: 'Tagum Pet Care Clinic',
    veterinarian: 'Dr. Maria Santos',
    verified: true,
    notes: 'First rabies vaccination. No adverse reactions were observed after administration.',
    nextDue: 'Aug 14, 2027',
    boosterDue: false,
  },
  'five-in-one': {
    id: 'five-in-one',
    type: 'vaccine',
    name: '5-in-1 Vaccine',
    pet: 'Bantay',
    date: 'Sep 20, 2026',
    clinic: 'Tagum Pet Care Clinic',
    veterinarian: 'Dr. Maria Santos',
    verified: true,
    notes: 'Second dose of the 5-in-1 vaccine. Bantay tolerated the shot well.',
    nextDue: 'Sep 20, 2027',
    boosterDue: true,
  },
  'annual-checkup': {
    id: 'annual-checkup',
    type: 'checkup',
    name: 'Annual Checkup',
    pet: 'Bantay',
    date: 'Jun 03, 2026',
    clinic: 'Tagum Pet Care Clinic',
    veterinarian: 'Dr. Maria Santos',
    verified: true,
    notes: 'Healthy weight at 26.4 kg. Dental and coat condition checked. All clear.',
    nextDue: 'Jun 03, 2027',
    boosterDue: false,
  },
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function RecordDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ record?: string }>();
  const recordId = Array.isArray(params.record) ? params.record[0] : params.record ?? 'anti-rabies';
  const record = recordDetails[recordId] ?? recordDetails['anti-rabies'];
  const Icon = record.type === 'vaccine' ? SyringeIcon : StethoscopeIcon;

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
              onPress={() => goBack('/health-records')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>HEALTH RECORD</Text>
          <Text style={styles.heading}>{record.name}</Text>
          <Text style={styles.subheading}>{record.pet} · {record.date}</Text>

          <View style={styles.headerCard}>
            <View style={styles.headerIcon}>
              <Icon size={26} />
            </View>
            <View style={styles.headerBody}>
              <Text style={styles.headerTitle}>{record.name}</Text>
              <Text style={styles.headerMeta}>{record.pet}</Text>
              <View style={[styles.statusPill, record.boosterDue ? styles.statusDue : styles.statusVerified]}>
                <Text style={styles.statusLabel}>
                  {record.boosterDue ? 'Next booster due' : 'Verified'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Record details</Text>

          <View style={styles.card}>
            <InfoRow label="Date administered" value={record.date} />
            <InfoRow label="Veterinary clinic" value={record.clinic} />
            <InfoRow label="Veterinarian" value={record.veterinarian} />
            {record.nextDue ? <InfoRow label="Next booster date" value={record.nextDue} /> : null}
          </View>

          <Text style={styles.sectionLabel}>Notes</Text>
          <View style={styles.card}>
            <Text style={styles.notesText}>{record.notes}</Text>
          </View>
        </ScrollView>

        <BottomNav active="home" />
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
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  subheading: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.forestDark,
    borderRadius: 18,
    padding: Spacing.four,
    boxShadow: '0 5px 12px rgba(0, 15, 3, 0.18)',
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
    gap: Spacing.one,
  },
  headerTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.white,
  },
  headerMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: '#C9DBC6',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    marginTop: Spacing.one,
  },
  statusVerified: {
    backgroundColor: Palette.sage,
  },
  statusDue: {
    backgroundColor: Palette.goldSoft,
  },
  statusLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  card: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    boxShadow: '0 3px 8px rgba(0, 15, 3, 0.05)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderSoft,
  },
  infoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  notesText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkMuted,
  },
  pressed: {
    opacity: 0.85,
  },
});