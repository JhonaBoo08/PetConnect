import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  NotebookIcon,
  PillIcon,
  PlusIcon,
  StethoscopeIcon,
  SyringeIcon,
  WarningIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isoToLongDate, isoToShortDate, parseIsoDate } from '@/lib/date';
import { type HealthRecord, type HealthRecordType, useHealthRecords } from '@/lib/health';
import { goBack } from '@/lib/navigation';

function truncate(value: string, max = 32): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}\u2026`;
}

function DescriptionIcon({ type }: { type: HealthRecordType }) {
  switch (type) {
    case 'Vaccination':
      return <SyringeIcon size={20} />;
    case 'Checkup':
      return <StethoscopeIcon size={20} />;
    case 'Medication':
      return <PillIcon size={20} />;
    default:
      return <NotebookIcon size={20} />;
  }
}

function recordDescription(record: HealthRecord): string {
  const hasDue = Boolean(record.nextDueDate);
  if (record.recordType === 'Vaccination') {
    return hasDue ? 'Next booster due' : `Verified by ${record.veterinaryClinic}`;
  }
  if (record.recordType === 'Medication') {
    if (hasDue) return 'Next dose due';
    return truncate(record.notes) || `Verified by ${record.veterinaryClinic}`;
  }
  if (record.recordType === 'Checkup') {
    return truncate(record.notes) || `Verified by ${record.veterinaryClinic}`;
  }
  return truncate(record.notes) || 'Record on file';
}

function RecordCard({ record, onPress }: { record: HealthRecord; onPress: () => void }) {
  const verified = !record.nextDueDate;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}>
      <View style={styles.recordIcon}>
        <DescriptionIcon type={record.recordType} />
      </View>
      <View style={styles.recordBody}>
        <Text style={styles.recordTitle}>{record.recordName}</Text>
        <Text style={styles.recordDescription}>
          {recordDescription(record)}
        </Text>
        <Text style={styles.recordDate}>{isoToLongDate(record.recordDate)}</Text>
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

function summaryValues(records: HealthRecord[]): { lastCheckup: string; nextBooster: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkups = records.filter((record) => record.recordType === 'Checkup');
  const lastCheckupIso = checkups
    .map((record) => record.recordDate)
    .sort()
    .at(-1);
  const lastCheckup = lastCheckupIso ? isoToShortDate(lastCheckupIso) : '\u2014';

  const boosters = records
    .filter(
      (record) =>
        record.recordType === 'Vaccination' && record.nextDueDate && record.nextDueDate,
    )
    .map((record) => record.nextDueDate as string);
  const upcoming = boosters
    .filter((iso) => {
      const due = parseIsoDate(iso);
      return due ? due.getTime() >= today.getTime() : false;
    })
    .sort();
  const nextBoosterIso = upcoming[0] ?? boosters.sort()[0];
  const nextBooster = nextBoosterIso ? isoToShortDate(nextBoosterIso) : '\u2014';

  return { lastCheckup, nextBooster };
}

export default function HealthRecordsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const petName = Array.isArray(params.name) ? params.name[0] : params.name ?? 'Bantay';
  const eyebrow = `${petName}${petName.toLowerCase().endsWith('s') ? '' : '\u2019s'} care`;

  const records = useHealthRecords()
    .filter((record) => record.petName === petName)
    .sort((a, b) => (a.recordDate === b.recordDate ? b.createdAt - a.createdAt : a.recordDate < b.recordDate ? 1 : -1));
  const { lastCheckup, nextBooster } = summaryValues(records);

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
              <Text style={styles.summaryValue}>{lastCheckup}</Text>
            </View>
            <View style={[styles.summaryCard, styles.summaryGold]}>
              <Text style={styles.summaryLabel}>NEXT BOOSTER</Text>
              <Text style={styles.summaryValue}>{nextBooster}</Text>
            </View>
          </View>

          <View style={styles.recordList}>
            {records.length > 0 ? (
              records.map((record) => (
                <RecordCard key={record.id} record={record} onPress={() => openRecord(record)} />
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyLabel}>No health records yet.</Text>
                <Text style={styles.emptyHint}>
                  Add a vaccination, checkup, or treatment to get started.
                </Text>
              </View>
            )}
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
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
  },
  emptyLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  emptyHint: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    textAlign: 'center',
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