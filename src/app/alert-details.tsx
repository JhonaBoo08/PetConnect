import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PawIcon,
  PinIcon,
  ShareIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  currentOwnerId,
  distanceFromReference,
  markAlertFound,
  timeAgo,
  useLostPetAlerts,
} from '@/lib/lost-pets';
import { goBack } from '@/lib/navigation';
import { addNotification } from '@/lib/notifications';
import { usePets } from '@/lib/pets';

export default function AlertDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const idParam = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const alerts = useLostPetAlerts();
  const pets = usePets();
  const alert = alerts.find((a) => a.id === idParam) ?? null;
  const [foundOpen, setFoundOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const ownerId = currentOwnerId();
  const isOwner = alert?.ownerId === ownerId;
  const pet = alert ? pets.find((p) => p.id === alert.petId) : null;
  const photo = alert?.photoUrl || alert?.petPhoto || pet?.photo || '';
  const distance = alert ? distanceFromReference(alert.latitude, alert.longitude) : null;
  const isLost = alert?.reportKind === 'Lost';

  if (!alert) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/alerts')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Alert not found</Text>
            <Text style={styles.emptyText}>
              This lost-pet alert is no longer available.
            </Text>
          </View>
          <BottomNav active="alerts" />
        </SafeAreaView>
      </View>
    );
  }

  const onMarkFound = async () => {
    setBusy(true);
    try {
      await markAlertFound(alert.id);
      await addNotification({
        id: `ntf-found-${alert.id}`,
        kind: 'found',
        title: 'Pet found',
        description: `${alert.petName} has been marked as found.`,
        timestamp: 'Just now',
        route: { pathname: '/alert-details', params: { id: alert.id } },
      });
      setFoundOpen(false);
      goBack('/alerts');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/alerts')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
            <Text style={styles.topBarTitle}>Alert details</Text>
          </View>

          <View style={styles.headerCard}>
            <View style={styles.headerPhoto}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.headerPhotoImage} contentFit="cover" />
              ) : (
                <PawIcon size={34} color={Palette.forestDark} />
              )}
            </View>
            <View style={styles.headerBody}>
              <View style={styles.headerTopRow}>
                <Text style={styles.petName}>{alert.petName}</Text>
                <View style={[styles.statusPill, isLost ? styles.statusLost : styles.statusFound]}>
                  <Text style={styles.statusText}>{isLost ? 'Lost' : 'Found'}</Text>
                </View>
              </View>
              <Text style={styles.petMeta}>
                {alert.reportKind === 'Lost' ? 'Lost pet alert' : 'Found pet notice'} · Posted{' '}
                {timeAgo(alert.createdAt)}
              </Text>
              {isOwner ? (
                <Text style={styles.ownerTag}>Your alert</Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.sectionLabel}>LAST SEEN</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <PinIcon size={18} color={Palette.forestDark} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailTitle}>{alert.locationName}</Text>
                <Text style={styles.detailSub}>Near {alert.locationName}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <ClockIcon size={18} color={Palette.forestDark} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailTitle}>Last seen {timeAgo(alert.createdAt)}</Text>
                <Text style={styles.detailSub}>
                  {distance !== null ? `${distance} km from the reference point` : 'Location pinned manually'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>WHAT TO LOOK FOR</Text>
          <View style={styles.detailCard}>
            <Text style={styles.description}>
              {alert.description || 'No additional description provided.'}
            </Text>
          </View>

          {isOwner ? (
            <View style={styles.ownerActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/alerts', params: { edit: alert.id } })
                }
                style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}>
                <Text style={styles.outlineLabel}>Edit alert</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFoundOpen(true)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <CheckIcon />
                <Text style={styles.primaryLabel}>Mark as found</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setReportOpen(true)}
              style={({ pressed }) => [styles.foundReportButton, pressed && styles.pressed]}>
              <ShareIcon />
              <Text style={styles.foundReportLabel}>I found this pet</Text>
            </Pressable>
          )}

          {pet ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/pet-id', params: { name: pet.name } })
              }
              style={({ pressed }) => [styles.safeLink, pressed && styles.pressed]}>
              <View>
                <Text style={styles.safeLinkLabel}>RECOVERY CONTACT</Text>
                <Text style={styles.safeLinkText}>
                  Public pet profile with the owner&apos;s recovery contact
                </Text>
              </View>
              <ChevronRightIcon />
            </Pressable>
          ) : null}
        </ScrollView>

        <BottomNav active="alerts" />
      </SafeAreaView>

      {foundOpen ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Mark {alert.petName} as found?</Text>
            <Text style={styles.sheetText}>
              This will remove the active lost-pet alert from the recovery feed.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFoundOpen(false)}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onMarkFound}
              disabled={busy}
              style={({ pressed }) => [styles.sheetConfirm, (pressed || busy) && styles.pressed]}>
              <Text style={styles.sheetConfirmLabel}>Mark as found</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {reportOpen ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Found {alert.petName}?</Text>
            <Text style={styles.sheetText}>
              Thank you for helping reunite a pet with its family. Reach out through the pet&apos;s
              recovery contact on its public profile.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReportOpen(false)}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setReportOpen(false);
                if (pet) {
                  router.push({ pathname: '/pet-id', params: { name: pet.name } });
                } else {
                  router.push('/alerts');
                }
              }}
              style={({ pressed }) => [styles.sheetConfirm, pressed && styles.pressed]}>
              <Text style={styles.sheetConfirmLabel}>Open recovery contact</Text>
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
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  topBarTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
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
  headerCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    marginTop: Spacing.five,
    shadowColor: '#1B4332',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerPhoto: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerPhotoImage: {
    width: '100%',
    height: '100%',
  },
  headerBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  statusLost: {
    backgroundColor: Palette.goldSoft,
  },
  statusFound: {
    backgroundColor: Palette.sage,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  ownerTag: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    color: Palette.forestDark,
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
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: {
    flex: 1,
  },
  detailTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  detailSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  description: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.forestDark,
  },
  ownerActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.five,
  },
  outlineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  outlineLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
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
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  foundReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
  },
  foundReportLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  safeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  safeLinkLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Palette.forestDark,
  },
  safeLinkText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
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
    alignItems: 'center',
    gap: Spacing.two,
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  sheetText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  sheetCancel: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  sheetCancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  sheetConfirm: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  sheetConfirmLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
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
    marginTop: Spacing.four,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
});