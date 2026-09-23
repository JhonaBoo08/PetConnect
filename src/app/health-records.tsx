import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  StethoscopeIcon,
  SyringeIcon,
  WarningIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type HealthRecord = {
  id: string;
  type: 'vaccine' | 'checkup';
  name: string;
  description: string;
  date: string;
  status: 'verified' | 'due';
};

const records: HealthRecord[] = [
  {
    id: 'anti-rabies',
    type: 'vaccine',
    name: 'Anti-Rabies',
    description: 'Verified by Tagum Pet Care',
    date: 'Aug 14, 2026',
    status: 'verified',
  },
  {
    id: 'five-in-one',
    type: 'vaccine',
    name: '5-in-1 Vaccine',
    description: 'Next booster due',
    date: 'Sep 20, 2026',
    status: 'due',
  },
  {
    id: 'annual-checkup',
    type: 'checkup',
    name: 'Annual Checkup',
    description: 'Healthy weight · 26.4 kg',
    date: 'Jun 03, 2026',
    status: 'verified',
  },
];

function RecordCard({ record, onPress }: { record: HealthRecord; onPress: () => void }) {
  const Icon = record.type === 'vaccine' ? SyringeIcon : StethoscopeIcon;
  const verified = record.status === 'verified';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}>
      <View style={styles.recordIcon}>
        <Icon size={20} />
      </View>
      <View style={styles.recordBody}>
        <Text style={styles.recordTitle}>{record.name}</Text>
        <Text style={styles.recordDescription}>{record.description}</Text>
        <Text style={styles.recordDate}>{record.date}</Text>
      </View>
      <View style={styles.recordStatus}>
        {verified ? (
          <CheckIcon size={16} color={Palette.forestDark} />
        ) : (
          <WarningIcon size={16} color={Palette.gold} />
        )}
        <ChevronRightIcon />
      </View>
    </Pressable>
  );
}

export default function HealthRecordsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const petName = Array.isArray(params.name) ? params.name[0] : params.name ?? 'Bantay';
  const eyebrow = `${petName}${petName.toLowerCase().endsWith('s') ? '' : '\u2019s'} care`;

  const addRecord = () => router.push({ pathname: '/add-record', params: { name: petName } });
  const openRecord = (record: HealthRecord) =>
    router.push({ pathname: '/record-details', params: { record: record.id, name: petName } });

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
              onPress={() => goBack('/dashboard')}
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

          <Text style={styles.category}>{eyebrow.toUpperCase()}</Text>
          <Text style={styles.heading}>Health records</Text>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summarySage]}>
              <Text style={styles.summaryLabel}>LAST CHECKUP</Text>
              <Text style={styles.summaryValue}>Jun 03</Text>
            </View>
            <View style={[styles.summaryCard, styles.summaryGold]}>
              <Text style={styles.summaryLabel}>NEXT BOOSTER</Text>
              <Text style={styles.summaryValue}>Sep 20</Text>
            </View>
          </View>

          <View style={styles.recordList}>
            {records.map((record) => (
              <RecordCard key={record.id} record={record} onPress={() => openRecord(record)} />
            ))}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={addRecord}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <PlusIcon size={16} />
              <Text style={styles.primaryLabel}>Add record</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/health-reminders')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Reminders</Text>
            </Pressable>
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
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: 3,
  },
  summarySage: {
    backgroundColor: Palette.sage,
  },
  summaryGold: {
    backgroundColor: Palette.goldSoft,
  },
  summaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Palette.inkMuted,
  },
  summaryValue: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  recordList: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 80,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    boxShadow: '0 3px 8px rgba(0, 15, 3, 0.06)',
  },
  recordIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBody: {
    flex: 1,
    gap: 2,
  },
  recordTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  recordDescription: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  recordDate: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: 2,
  },
  recordStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.five,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.sage,
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});