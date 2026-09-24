import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  NotebookIcon,
  PillIcon,
  StethoscopeIcon,
  SyringeIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isoToLongDate } from '@/lib/date';
import {
  deleteHealthRecord,
  seedHealthRecords,
  type HealthRecord,
  type HealthRecordType,
  useHealthRecords,
} from '@/lib/health';
import { goBack } from '@/lib/navigation';

function RecordIcon({ type }: { type: HealthRecordType }) {
  switch (type) {
    case 'Vaccination':
      return <SyringeIcon size={26} />;
    case 'Checkup':
      return <StethoscopeIcon size={26} />;
    case 'Medication':
      return <PillIcon size={26} />;
    default:
      return <NotebookIcon size={26} />;
  }
}

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
  const params = useLocalSearchParams<{ record?: string; name?: string }>();
  const recordId = Array.isArray(params.record) ? params.record[0] : params.record ?? '';
  const petName = Array.isArray(params.name) ? params.name[0] : params.name ?? 'Bantay';

  const stored = useHealthRecords();
  const record =
    stored.find((candidate) => candidate.id === recordId) ??
    seedHealthRecords.find((candidate) => candidate.id === recordId) ??
    seedHealthRecords[0];

  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteHealthRecord(record.id);
      goBack('/health-records');
    } finally {
      setDeleting(false);
    }
  };

  const boosterDue = Boolean(record.nextDueDate);

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
          <Text style={styles.heading}>{record.recordName}</Text>
          <Text style={styles.subheading}>
            {record.petName} · {isoToLongDate(record.recordDate)}
          </Text>

          <View style={styles.headerCard}>
            <View style={styles.headerIcon}>
              <RecordIcon type={record.recordType} />
            </View>
            <View style={styles.headerBody}>
              <Text style={styles.headerType}>{record.recordType}</Text>
              <Text style={styles.headerName}>{record.recordName}</Text>
              <View
                style={[
                  styles.statusPill,
                  boosterDue ? styles.statusDue : styles.statusVerified,
                ]}>
                <Text style={styles.statusLabel}>
                  {boosterDue ? 'Next booster due' : 'Verified'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Record details</Text>

          <View style={styles.card}>
            <InfoRow label="Record type" value={record.recordType} />
            <InfoRow label="Date" value={isoToLongDate(record.recordDate)} />
            <InfoRow label="Veterinary clinic" value={record.veterinaryClinic} />
            {record.nextDueDate ? (
              <InfoRow label="Next due date" value={isoToLongDate(record.nextDueDate)} />
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Notes</Text>
          <View style={styles.card}>
            <Text style={styles.notesText}>
              {record.notes.trim() || 'No notes added.'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/add-record',
                params: { record: record.id, name: petName },
              })
            }
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editLabel}>Edit health record</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setRemoving(true)}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
            <Text style={styles.deleteLabel}>Delete health record</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {removing ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Delete health record?</Text>
            <Text style={styles.sheetMeta}>
              This record will be removed from {record.petName}&apos;s health history.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRemoving(false)}
              disabled={deleting}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={remove}
              disabled={deleting}
              style={({ pressed }) => [
                styles.sheetDelete,
                (pressed || deleting) && styles.pressed,
              ]}>
              <Text style={styles.sheetDeleteLabel}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  headerType: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#C9DBC6',
    textTransform: 'uppercase',
  },
  headerName: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.white,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  editLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    marginTop: Spacing.three,
  },
  deleteLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.danger,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20,40,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  sheetMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  sheetCancel: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  sheetCancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  sheetDelete: {
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDeleteLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.white,
  },
  pressed: {
    opacity: 0.85,
  },
});