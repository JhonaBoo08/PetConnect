import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, HealthIcon, PawIcon, ShareIcon, ShieldIcon, WarningIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { QrCode } from '@/components/pet-qr';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { activeLostAlertForPet, useLostPetAlerts } from '@/lib/lost-pets';
import { goBack } from '@/lib/navigation';
import { petAge, seedPets, usePets } from '@/lib/pets';

export default function PetIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const requested = Array.isArray(params.name) ? params.name[0] : params.name;
  const petName = requested ?? 'Bantay';
  const pet =
    usePets().find((candidate) => candidate.name === petName) ??
    seedPets.find((candidate) => candidate.name === petName) ??
    seedPets[0];
  const lostAlerts = useLostPetAlerts();
  const lostAlert = activeLostAlertForPet(lostAlerts, pet.id);

  const [sharing, setSharing] = useState(false);

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
          <Text style={styles.petName}>{petName}</Text>
          <Text style={styles.supporting}>
            This recovery-safe card can be shared when {petName} needs help.
          </Text>

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
            {pet.contactMobile} · {pet.contactLocation}
          </Text>
        </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSharing(true)}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
              <ShareIcon />
              <Text style={styles.shareLabel}>Share QR</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/health-records', params: { name: petName } })}
              style={({ pressed }) => [styles.healthButton, pressed && styles.pressed]}>
              <HealthIcon size={18} />
              <Text style={styles.healthLabel}>Health</Text>
            </Pressable>
          </View>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {sharing ? (
        <View style={styles.overlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Share {petName}&apos;s Pet ID</Text>
            <View style={styles.shareCard}>
              <View style={styles.sharePhoto}>
                {pet.photo ? (
                  <Image source={{ uri: pet.photo }} style={styles.sharePhotoImage} contentFit="cover" />
                ) : (
                  <PawIcon size={40} color={Palette.forestDark} />
                )}
              </View>
              <View style={styles.shareNameRow}>
                <Text style={styles.shareName}>{petName}</Text>
                {lostAlert ? (
                  <View style={styles.shareLostBadge}>
                    <WarningIcon size={11} color={Palette.forestDark} />
                    <Text style={styles.shareLostBadgeLabel}>LOST PET</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.shareMeta}>{`${pet.breed} · ${pet.sex}`}</Text>
              <QrCode seed={pet.id} size={96} />
              <Text style={styles.shareId}>{pet.id}</Text>
            </View>
            <Text style={styles.privacyNote}>Only recovery-safe information is shared.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSharing(false)}
              style={({ pressed }) => [styles.shareClose, pressed && styles.pressed]}>
              <Text style={styles.shareCloseLabel}>Done</Text>
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
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  shareLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  healthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  healthLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
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
  shareSheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  shareTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  shareCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    padding: Spacing.four,
    marginTop: Spacing.two,
  },
  sharePhoto: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sharePhotoImage: {
    width: '100%',
    height: '100%',
  },
  shareName: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.white,
  },
  shareNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shareLostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  shareLostBadgeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: Palette.forestDark,
  },
  shareMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#C9DBC6',
  },
  shareId: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.white,
    letterSpacing: 0.5,
  },
  privacyNote: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  shareClose: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  shareCloseLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
