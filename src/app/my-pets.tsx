import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  PawIcon,
  PlusIcon,
  QrIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';
import { getPets, petAge, usePets, type Pet } from '@/lib/pets';

function PetCard({ pet, onViewQr }: { pet: Pet; onViewQr: () => void }) {
  return (
    <View style={styles.petCard}>
      <View style={styles.petTopRow}>
        <View style={styles.petThumb}>
          {pet.photo ? (
            <Image source={{ uri: pet.photo }} style={styles.petPhoto} contentFit="cover" />
          ) : (
            <PawIcon size={28} color={Palette.forestDark} />
          )}
        </View>
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.petDetails}>
            {`${pet.breed} \u00b7 ${pet.sex} \u00b7 ${petAge(pet)}`}
          </Text>
          <Text style={styles.petId}>{pet.id}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${pet.name}'s QR code`}
        onPress={onViewQr}
        style={({ pressed }) => [styles.viewQrButton, pressed && styles.pressed]}>
        <QrIcon size={16} color={Palette.forestDark} />
        <Text style={styles.viewQrLabel}>View QR</Text>
      </Pressable>
    </View>
  );
}

export default function MyPetsScreen() {
  const router = useRouter();
  const pets = usePets();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      await getPets();
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPet = (pet: Pet) =>
    router.push({ pathname: '/pet-id', params: { name: pet.name } });

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

          <Text style={styles.category}>YOUR PETS</Text>
          <Text style={styles.heading}>My Pets</Text>
          <Text style={styles.supporting}>View and share your pets&apos; Pet-Connect QR IDs.</Text>

          {status === 'loading' ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Loading your pets…</Text>
              <Text style={styles.stateText}>
                Just a moment while we fetch your Pet-Connect IDs.
              </Text>
            </View>
          ) : status === 'error' ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Unable to load your pets.</Text>
              <Text style={styles.stateText}>
                Please check your connection and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={load}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryLabel}>Try Again</Text>
              </Pressable>
            </View>
          ) : pets.length === 0 ? (
            <View style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <PawIcon size={26} color={Palette.forestDark} />
              </View>
              <Text style={styles.stateTitle}>No pets registered yet.</Text>
              <Text style={styles.stateText}>
                Add your first pet to create a Pet-Connect ID and QR code.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/add-pet')}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <PlusIcon size={16} color={Palette.forestDark} />
                <Text style={styles.primaryLabel}>Add Pet</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.list}>
                {pets.map((pet) => (
                  <PetCard key={pet.id} pet={pet} onViewQr={() => openPet(pet)} />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/add-pet')}
                style={({ pressed }) => [styles.addAnotherButton, pressed && styles.pressed]}>
                <PlusIcon size={16} color={Palette.forestDark} />
                <Text style={styles.addAnotherLabel}>Add another pet</Text>
              </Pressable>
            </>
          )}
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  petCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.06)',
  },
  petTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  petThumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  petPhoto: {
    width: '100%',
    height: '100%',
  },
  petInfo: {
    flex: 1,
    gap: 2,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  petDetails: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.inkMuted,
  },
  petId: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Palette.forestDark,
    marginTop: 2,
  },
  viewQrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
  },
  viewQrLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Palette.forestDark,
    backgroundColor: Palette.sage,
    marginTop: Spacing.four,
  },
  addAnotherLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 180,
    marginTop: Spacing.four,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    padding: Spacing.four,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  stateTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
