import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  NotebookIcon,
  PillIcon,
  ShieldIcon,
  StethoscopeIcon,
  SyringeIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { getClinicAccessSync } from '@/lib/clinic-access';
import { useClinicProfile } from '@/lib/clinic';
import { isoToLongDate } from '@/lib/date';
import { type HealthRecordType, useHealthRecords } from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { usePets } from '@/lib/pets';

function RecordIcon({ type }: { type: HealthRecordType }) {
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

export default function ClinicRecordsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string }>();
  const petIdParam = Array.isArray(params.pet) ? params.pet[0] : (params.pet ?? '');
  const pets = usePets();
  const pet = pets.find((candidate) => candidate.id === petIdParam) ?? null;
  const clinic = useClinicProfile();
  const records = useHealthRecords();

  const access = clinic ? getClinicAccessSync(clinic.clinicId, petIdParam) : null;

  useEffect(() => {
    if (clinic && pet && access && access.status !== 'active') {
      router.replace({ pathname: '/clinic-scan-result', params: { pet: pet.id } });
    }
  }, [clinic, pet, access, router]);

  if (!pet || !clinic || !access || access.status !== 'active') {
    return null;
  }

  const petRecords = records
    .filter((record) => record.petId === pet.id)
    .sort((a, b) =>
      a.recordDate === b.recordDate ? b.createdAt - a.createdAt : a.recordDate < b.recordDate ? 1 : -1,
    );

  const updateVaccine = () =>
    router.push({ pathname: '/clinic-add-record', params: { pet: pet.id } });

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
              onPress={() =>
                goBack({ pathname: '/clinic-scan-result', params: { pet: pet.id } })
              }
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · HEALTH HISTORY</Text>
          <Text style={styles.heading}>{pet.name}&apos;s records</Text>
          <Text style={styles.supporting}>
            Vaccinations, checkups, and treatments on file.
          </Text>

          <View style={styles.grantBanner}>
            <View style={styles.grantIcon}>
              <ShieldIcon size={18} color={Palette.forestDark} />
            </View>
            <View style={styles.grantBody}>
              <Text style={styles.grantTitle}>Owner-approved access</Text>
              <Text style={styles.grantText}>
                {access.ownerName} granted {clinic.clinicName} access to review these records.
              </Text>
            </View>
          </View>

          <View style={styles.recordList}>
            {petRecords.length > 0 ? (
              petRecords.map((record) => (
                <View key={record.id} style={styles.recordCard}>
                  <View style={styles.recordIcon}>
                    <RecordIcon type={record.recordType} />
                  </View>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{record.recordName}</Text>
                    <Text style={styles.recordDescription}>
                      {record.recordType} · {isoToLongDate(record.recordDate)}
                    </Text>
                    <Text style={styles.recordMeta}>
                      {record.veterinaryClinic}
                      {record.nextDueDate
                        ? ` · Boost or next due ${isoToLongDate(record.nextDueDate)}`
                        : ''}
                    </Text>
                  </View>
                  {record.nextDueDate ? <CheckIcon size={16} color={Palette.gold} /> : <View />}
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyLabel}>No health records yet.</Text>
                <Text style={styles.emptyHint}>
                  {pet.name} has no records on file. Update a vaccine to get started.
                </Text>
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={updateVaccine}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <SyringeIcon size={18} color={Palette.forestDark} />
            <Text style={styles.primaryLabel}>Update vaccine</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="scan" />
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
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  grantBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    backgroundColor: Palette.sage,
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  grantIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grantBody: {
    flex: 1,
    gap: 3,
  },
  grantTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  grantText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  recordList: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 76,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    boxShadow: '0px 3px 8px rgba(0, 15, 3, 0.06)',
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
  recordMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
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
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 999,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    boxShadow: '0px 4px 10px rgba(242,182,50,0.30)',
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});