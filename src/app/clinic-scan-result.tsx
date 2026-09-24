import { useLocalSearchParams, useRouter } from 'expo-router';
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
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  PawIcon,
  ShieldIcon,
  WarningIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useClinicAccess, requestPetAccess } from '@/lib/clinic-access';
import { useClinicGate, useClinicProfile, useClinicProfiles } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';
import { petAge, usePetById } from '@/lib/pets';
import { useSession } from '@/lib/session';

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ClinicScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string }>();
  const petIdParam = Array.isArray(params.pet) ? params.pet[0] : (params.pet ?? '');
  const session = useSession();
  const clinic = useClinicProfile();
  const { ready: clinicReady } = useClinicProfiles();
  const accessList = useClinicAccess();
  const pet = usePetById(petIdParam);
  useClinicGate();

  const access = clinic
    ? (accessList.find(
        (entry) => entry.clinicId === clinic.clinicId && entry.petId === pet?.id,
      ) ?? null)
    : null;

  const loading = !session.ready || !clinicReady || pet === undefined;
  const status = access?.status ?? null;

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <ActivityIndicator color={Palette.forestDark} />
            <Text style={styles.emptyText}>Loading pet profile…</Text>
          </View>
          <BottomNav variant="clinic" active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/scan')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.centerWrap}>
            <View style={styles.centerIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Pet profile not found.</Text>
            <Text style={styles.emptyText}>
              This Pet-Connect ID could not be matched to a pet profile.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack('/scan')}
              style={({ pressed }) => [styles.fullButton, pressed && styles.pressed]}>
              <Text style={styles.fullButtonLabel}>Scan again</Text>
            </Pressable>
          </View>
          <BottomNav variant="clinic" active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (!clinic) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <Text style={styles.emptyTitle}>Unable to load clinic workspace.</Text>
            <Text style={styles.emptyText}>Please sign in with a verified clinic account.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/clinic-verification')}
              style={({ pressed }) => [styles.fullButton, pressed && styles.pressed]}>
              <Text style={styles.fullButtonLabel}>Go to verification</Text>
            </Pressable>
          </View>
          <BottomNav variant="clinic" active="scan" />
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/scan')}
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

          <Text style={styles.category}>CLINIC · PET PROFILE</Text>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.supporting}>Recovery-safe details from {pet.name}&apos;s profile.</Text>

          <View style={styles.petCard}>
            <View style={styles.petThumb}>
              <PawIcon size={30} color={Palette.forestDark} />
            </View>
            <View style={styles.petBody}>
              <Text style={styles.petBreed}>{pet.breed}</Text>
              <Text style={styles.petMeta}>{`${pet.species} · ${pet.sex} · ${petAge(pet)}`}</Text>
              <Text style={styles.petId}>{pet.id}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>PET INFORMATION</Text>
          <View style={styles.detailCard}>
            <InfoRow label="Species" value={pet.species} />
            <InfoRow label="Breed" value={pet.breed} />
            <InfoRow label="Sex" value={pet.sex} />
            <InfoRow label="Age" value={petAge(pet)} />
            <InfoRow label="Pet-Connect ID" value={pet.id} />
            {pet.details ? <InfoRow label="Identifying details" value={pet.details} /> : null}
            {pet.collar ? <InfoRow label="Collar" value={pet.collar} /> : null}
          </View>

          <Text style={styles.sectionLabel}>HEALTH RECORD ACCESS</Text>

          {status === 'active' ? (
            <View style={styles.accessBlock}>
              <View style={[styles.accessCard, styles.accessActive]}>
                <View style={styles.accessIcon}>
                  <CheckIcon size={18} color={Palette.forestDark} />
                </View>
                <View style={styles.accessBody}>
                  <Text style={styles.accessTitle}>Health access active</Text>
                  <Text style={styles.accessText}>
                    {pet.contactName} has approved access to {pet.name}&apos;s health records.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/clinic-records', params: { pet: pet.id } })
                }
                style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}>
                <Text style={styles.viewButtonLabel}>View health history</Text>
                <ChevronRightIcon size={18} color={Palette.forestDark} />
              </Pressable>
            </View>
          ) : null}

          {status === 'requested' ? (
            <View style={[styles.accessCard, styles.accessNeutral]}>
              <View style={styles.accessIcon}>
                <ShieldIcon size={18} color={Palette.forestDark} />
              </View>
              <View style={styles.accessBody}>
                <Text style={styles.accessTitle}>Access requested</Text>
                <Text style={styles.accessText}>
                  Waiting for {pet.contactName} to approve access to {pet.name}&apos;s records.
                </Text>
              </View>
            </View>
          ) : null}

          {status === 'declined' ? (
            <View style={styles.accessBlock}>
              <View style={[styles.accessCard, styles.accessDeclined]}>
                <View style={styles.accessIcon}>
                  <WarningIcon size={18} color={Palette.forestDark} />
                </View>
                <View style={styles.accessBody}>
                  <Text style={styles.accessTitle}>Access not granted</Text>
                  <Text style={styles.accessText}>
                    The owner declined this request. Ask {pet.contactName} to accept a new
                    request to continue.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void requestPetAccess(clinic.clinicId, clinic.clinicName, pet)}
                style={({ pressed }) => [styles.requestButton, pressed && styles.pressed]}>
                <Text style={styles.requestButtonLabel}>Request access</Text>
              </Pressable>
            </View>
          ) : null}

          {status === null ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Owner permission required</Text>
              <Text style={styles.pendingText}>
                Health records are private. Send a request to {pet.contactName} to view{' '}
                {pet.name}&apos;s history.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void requestPetAccess(clinic.clinicId, clinic.clinicName, pet)}
                style={({ pressed }) => [styles.requestButton, pressed && styles.pressed]}>
                <Text style={styles.requestButtonLabel}>Request access</Text>
              </Pressable>
            </View>
          ) : null}
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
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.forestDark,
    borderRadius: 18,
    padding: Spacing.four,
    marginTop: Spacing.four,
    boxShadow: '0px 5px 12px rgba(27,67,50,0.18)',
  },
  petThumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petBody: {
    flex: 1,
    gap: 3,
  },
  petBreed: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.white,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: '#D8E2D6',
  },
  petId: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
    color: Palette.white,
    letterSpacing: 0.5,
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
  detailCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  infoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  infoValue: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
    textAlign: 'right',
  },
  accessBlock: {
    gap: Spacing.two,
  },
  accessCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
    borderWidth: 1,
  },
  accessActive: {
    backgroundColor: Palette.sage,
    borderColor: Palette.borderSoft,
  },
  accessNeutral: {
    backgroundColor: Palette.surface,
    borderColor: Palette.borderSoft,
  },
  accessDeclined: {
    backgroundColor: Palette.goldSoft,
    borderColor: Palette.borderSoft,
  },
  accessIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessBody: {
    flex: 1,
    gap: 3,
  },
  accessTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  accessText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    boxShadow: '0px 4px 10px rgba(242,182,50,0.30)',
  },
  viewButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pendingCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  pendingTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  pendingText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  requestButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.two,
  },
  requestButtonLabel: {
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