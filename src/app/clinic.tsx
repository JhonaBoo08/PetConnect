import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  NotebookIcon,
  PillIcon,
  QrIcon,
  SendIcon,
  ShieldIcon,
  StethoscopeIcon,
  SyringeIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useClinicNotifications } from '@/lib/clinic-notifications';
import {
  reloadClinic,
  useClinicProfile,
  useClinicProfiles,
} from '@/lib/clinic';
import { formatTime } from '@/lib/date';
import { type HealthRecord, type HealthRecordType, useHealthRecords } from '@/lib/health';
import { useSession } from '@/lib/session';

function RecordIcon({ type }: { type: HealthRecordType }) {
  switch (type) {
    case 'Vaccination':
      return <SyringeIcon size={18} />;
    case 'Checkup':
      return <StethoscopeIcon size={18} />;
    case 'Medication':
      return <PillIcon size={18} />;
    default:
      return <NotebookIcon size={18} />;
  }
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function useNow() {
  const now = new Date();
  const dateLabel = `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return { dateLabel, greeting, now };
}

export default function ClinicWorkspaceScreen() {
  const router = useRouter();
  const session = useSession();
  const { ready: clinicReady } = useClinicProfiles();
  const clinic = useClinicProfile();
  const records = useHealthRecords();
  const clinicNotifications = useClinicNotifications();
  const { dateLabel, greeting, now } = useNow();

  useEffect(() => {
    if (session.ready && clinicReady && clinic && clinic.verificationStatus !== 'verified') {
      router.replace('/clinic-verification');
    }
  }, [session.ready, clinicReady, clinic, router]);

  const todayRecords = useMemo(() => {
    if (!clinic) return [];
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return records
      .filter(
        (record: HealthRecord) =>
          record.clinicId === clinic.clinicId && record.updatedAt >= start,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [records, clinic, now]);

  const unreadCount = clinicNotifications.filter((notification) => notification.unread).length;

  if (!session.ready || !clinicReady) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <ActivityIndicator color={Palette.forestDark} />
            <Text style={styles.centerHint}>Loading clinic workspace…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!clinic) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.centerIcon}>
              <ShieldIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Unable to load clinic workspace.</Text>
            <Text style={styles.emptyText}>
              We couldn&apos;t retrieve your clinic details. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void reloadClinic()}
              style={({ pressed }) => [styles.fullButton, pressed && styles.pressed]}>
              <Text style={styles.fullButtonLabel}>Try again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.brandMarkImage}
                  contentFit="contain"
                />
              </View>
              <View>
                <Text style={styles.brandName}>Pet-Connect</Text>
                <Text style={styles.brandTagline}>SCAN · PROTECT · RECONNECT</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={styles.bellButton}>
              <BellIcon />
              {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>

          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={styles.greeting}>{greeting}, {clinic.clinicName}!</Text>
          <View style={styles.verifiedPill}>
            <ShieldIcon size={14} color={Palette.forestDark} />
            <Text style={styles.verifiedLabel}>VERIFIED CLINIC</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}>
            <View style={styles.scanIcon}>
              <QrIcon size={30} color={Palette.gold} />
            </View>
            <View style={styles.scanBody}>
              <Text style={styles.scanTitle}>Scan Pet QR ID</Text>
              <Text style={styles.scanText}>
                View a pet&apos;s health details with owner-approved access.
              </Text>
            </View>
            <ChevronRightIcon color={Palette.gold} />
          </Pressable>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Today&apos;s records</Text>
            <View style={styles.countPill}>
              <Text style={styles.countLabel}>{todayRecords.length}</Text>
            </View>
          </View>

          <View style={styles.recordList}>
            {todayRecords.length > 0 ? (
              todayRecords.map((record) => (
                <Pressable
                  key={record.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/clinic-records', params: { pet: record.petId } })
                  }
                  style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}>
                  <View style={styles.recordIcon}>
                    <RecordIcon type={record.recordType} />
                  </View>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{record.recordName}</Text>
                    <Text style={styles.recordMeta}>
                      {record.petName} · {record.recordDate}
                    </Text>
                  </View>
                  <Text style={styles.recordTime}>
                    {record.updatedAt > 0 ? formatTime(new Date(record.updatedAt)) : ''}
                  </Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <CheckIcon size={18} color={Palette.forestDark} />
                </View>
                <Text style={styles.emptyLabel}>No records today</Text>
                <Text style={styles.emptyHint}>Scan a pet to get started.</Text>
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/clinic-feedback')}
            style={({ pressed }) => [styles.feedbackButton, pressed && styles.pressed]}>
            <SendIcon size={16} color={Palette.forestDark} />
            <Text style={styles.feedbackLabel}>Provide feedback</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="clinic" />
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandMarkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  brandName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: '800',
    color: Palette.forestDark,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    color: Palette.inkMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  bellButton: {
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
  date: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: Spacing.four,
  },
  greeting: {
    fontFamily: Fonts.sans,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '800',
    color: Palette.forestDark,
    letterSpacing: -0.5,
    marginTop: Spacing.one,
  },
  verifiedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    marginTop: Spacing.two,
  },
  verifiedLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: Palette.forestDark,
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.forestDark,
    borderRadius: 18,
    padding: Spacing.four,
    marginTop: Spacing.five,
    boxShadow: '0px 5px 12px rgba(27,67,50,0.22)',
  },
  scanIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBody: {
    flex: 1,
    gap: 3,
  },
  scanTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.white,
  },
  scanText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#D8E2D6',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.five,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  countPill: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  countLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  recordList: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 68,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  recordIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  recordMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  recordTime: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 128,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
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
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 999,
    backgroundColor: Palette.sage,
    marginTop: Spacing.five,
  },
  feedbackLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  centerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: Palette.inkMuted,
  },
  fullButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.three,
  },
  fullButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});