import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  PawIcon,
  PinIcon,
  ShieldIcon,
  UploadIcon,
  WarningIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { QrCode } from '@/components/pet-qr';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { createFoundReport } from '@/lib/found-reports';
import { activeLostAlertForPet, timeAgo, useLostPetAlerts } from '@/lib/lost-pets';
import { goBack } from '@/lib/navigation';
import { addNotification } from '@/lib/notifications';
import { getPetByIdSync, petAge, usePets } from '@/lib/pets';

function maskMobile(mobile: string): string {
  const parts = mobile.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return mobile;
  const [head, ...rest] = parts;
  const last = rest[rest.length - 1];
  const middles = rest.slice(0, -1).map(() => '•••').join(' ');
  const tail = last.length >= 3 ? `••${last.slice(-2)}` : last;
  return [head, middles, tail].filter(Boolean).join(' ');
}

export default function ScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string }>();
  const petIdParam = Array.isArray(params.pet) ? params.pet[0] : (params.pet ?? '');
  const pets = usePets();
  const lostAlerts = useLostPetAlerts();
  const pet =
    pets.find((candidate) => candidate.id === petIdParam) ??
    getPetByIdSync(petIdParam) ??
    null;
  const lostAlert = pet ? activeLostAlertForPet(lostAlerts, pet.id) : null;
  const isLost = Boolean(lostAlert);

  const [reportOpen, setReportOpen] = useState(false);
  const [where, setWhere] = useState('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
      } else {
        setPhoto(asset.uri);
      }
    } catch {
      // Photo is optional; keep the previous state on failure.
    }
  };

  const submit = async () => {
    if (!pet) return;
    if (!where.trim()) {
      setError('Please enter where you found the pet.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const report = await createFoundReport({
        petId: pet.id,
        petName: pet.name,
        where: where.trim(),
        message: message.trim(),
        photo,
      });
      await addNotification({
        id: `ntf-reunite-${report.id}`,
        kind: 'reunite',
        title: `${pet.name} may have been found`,
        description: `Someone scanned ${pet.name}'s Pet-Connect ID and reported finding the pet near ${report.where}.`,
        timestamp: 'Just now',
        route: { pathname: '/found-report', params: { id: report.id } },
      });
      setReportOpen(false);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setWhere('');
    setMessage('');
    setPhoto('');
    setError('');
  };

  const returnToScanner = () => {
    resetForm();
    setSubmitted(false);
    goBack('/scan');
  };

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
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Pet profile unavailable</Text>
            <Text style={styles.emptyText}>This Pet-Connect ID could not be found.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack('/scan')}
              style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
              <Text style={styles.emptyButtonLabel}>Scan again</Text>
            </Pressable>
          </View>
          <BottomNav active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.confirmWrap}>
            <View style={styles.confirmIcon}>
              <CheckIcon size={28} color={Palette.white} />
            </View>
            <Text style={styles.confirmTitle}>Recovery alert sent</Text>
            <Text style={styles.confirmText}>
              The pet owner has been notified that someone found their pet.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={returnToScanner}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}>
              <Text style={styles.confirmButtonLabel}>Return to scanner</Text>
            </Pressable>
          </View>
          <BottomNav active="scan" />
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
              onPress={() => router.push('/notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>DIGITAL PET ID</Text>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.supporting}>
            This recovery-safe card can be shared when {pet.name} needs help.
          </Text>

          {isLost ? (
            <View style={styles.lostBanner}>
              <View style={styles.lostBannerHeader}>
                <WarningIcon size={16} color={Palette.white} />
                <Text style={styles.lostBannerTitle}>LOST PET</Text>
              </View>
              <Text style={styles.lostBannerText}>
                {pet.name} has been reported lost.
              </Text>
              <View style={styles.lostBannerMeta}>
                <PinIcon size={13} color="#F4CE8A" />
                <Text style={styles.lostBannerMetaText}>
                  Last seen {lostAlert?.locationName ?? 'nearby'} · Reported{' '}
                  {lostAlert ? timeAgo(lostAlert.createdAt) : 'recently'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.petCard}>
            <View style={styles.photo}>
              {pet.photo ? (
                <Image source={{ uri: pet.photo }} style={styles.photoImage} contentFit="cover" />
              ) : (
                <>
                  <PawIcon size={64} color={Palette.forestDark} />
                  <Text style={styles.photoCaption}>{pet.breed}</Text>
                </>
              )}
            </View>

            <View style={styles.cardBody}>
              <View style={styles.breedRow}>
                <Text style={styles.breed}>{pet.breed}</Text>
                <ShieldIcon size={24} />
              </View>
              <Text style={styles.meta}>{`${pet.sex} · ${petAge(pet)}`}</Text>

              <View style={styles.idPanel}>
                <View style={styles.idText}>
                  <Text style={styles.idLabel}>UNIQUE PET ID</Text>
                  <Text style={styles.idValue}>{pet.id}</Text>
                </View>
                <QrCode seed={pet.id} size={72} />
              </View>
            </View>
          </View>

          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryLabel}>RECOVERY CONTACT</Text>
            <Text style={styles.recoveryName}>{pet.contactName}</Text>
            <Text style={styles.recoveryMeta}>
              {maskMobile(pet.contactMobile)} · {pet.contactLocation}
            </Text>
          </View>

          {isLost ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setReportOpen(true)}
              style={({ pressed }) => [styles.foundButton, pressed && styles.pressed]}>
              <CheckIcon />
              <Text style={styles.foundLabel}>I found this pet</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <BottomNav active="scan" />
      </SafeAreaView>

      {reportOpen ? (
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Help reunite {pet.name}</Text>
              <Text style={styles.sheetHint}>
                Only the owner will see the details you share here.
              </Text>

              <Text style={styles.sheetLabel}>Where did you find {pet.name}?</Text>
              <TextInput
                value={where}
                onChangeText={(value) => {
                  setWhere(value);
                  if (value.trim()) setError('');
                }}
                placeholder="e.g. Mankilam, Tagum"
                placeholderTextColor={Palette.placeholder}
                style={[styles.sheetInput, error ? styles.sheetInputInvalid : null]}
              />
              {error ? <Text style={styles.sheetError}>{error}</Text> : null}

              <Text style={styles.sheetLabel}>Message</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Optional message to the owner..."
                placeholderTextColor={Palette.placeholder}
                style={[styles.sheetInput, styles.sheetTextArea]}
                multiline
              />

              <Text style={styles.sheetLabel}>Add photo</Text>
              {photo ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photo }} style={styles.photoThumb} contentFit="cover" />
                  <Text style={styles.photoName}>Location photo</Text>
                  <Pressable accessibilityRole="button" onPress={() => setPhoto('')}>
                    <Text style={styles.photoRemove}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={pickPhoto}
                style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
                <UploadIcon size={16} />
                <Text style={styles.photoLabel}>
                  {photo ? 'Replace photo' : 'Add photo'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={submitting}
                style={({ pressed }) => [styles.sendButton, (pressed || submitting) && styles.pressed]}>
                <Text style={styles.sendLabel}>Send recovery alert</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReportOpen(false)}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
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
  lostBanner: {
    backgroundColor: Palette.danger,
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.four,
    gap: 4,
  },
  lostBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  lostBannerTitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Palette.white,
  },
  lostBannerText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.white,
  },
  lostBannerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  lostBannerMetaText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#F8E1C4',
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Palette.forestDark,
    shadowColor: '#1B4332',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  photo: {
    height: 188,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoCaption: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  cardBody: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  breedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breed: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: '800',
    color: Palette.white,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#C9DBC6',
  },
  idPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  idText: {
    flex: 1,
    gap: 3,
  },
  idLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#C9DBC6',
  },
  idValue: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
    color: Palette.white,
    letterSpacing: 0.5,
  },
  recoveryCard: {
    marginTop: Spacing.four,
    minHeight: 84,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#1B4332',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  recoveryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  recoveryName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
    marginTop: 2,
  },
  recoveryMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  foundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
    shadowColor: '#F2B632',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  foundLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
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
  sheetScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'stretch',
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  sheetHint: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    marginTop: 2,
    marginBottom: Spacing.one,
  },
  sheetLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  sheetInput: {
    minHeight: 44,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  sheetInputInvalid: {
    borderColor: Palette.danger,
  },
  sheetTextArea: {
    minHeight: 84,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  sheetError: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  photoThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Palette.sage,
  },
  photoName: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
  },
  photoRemove: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.danger,
    paddingHorizontal: Spacing.two,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  photoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
  },
  sendLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    marginTop: Spacing.two,
  },
  cancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
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
  emptyButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
  },
  emptyButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  confirmWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  confirmTitle: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  confirmText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  confirmButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  confirmButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});