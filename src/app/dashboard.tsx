import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  HealthIcon,
  PawIcon,
  PlusIcon,
  PinIcon,
  QrIcon,
  WarningIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

type Pet = {
  name: string;
  details: string;
  status: string;
  statusTone: 'healthy' | 'warning';
};

const pets: Pet[] = [
  { name: 'Bantay', details: 'Golden Retriever · 3 years', status: 'Healthy', statusTone: 'healthy' },
  { name: 'Mingming', details: 'Orange Tabby · 2 years', status: 'Booster due', statusTone: 'warning' },
];

function PetCard({ pet, onPress }: { pet: Pet; onPress: () => void }) {
  const isWarning = pet.statusTone === 'warning';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.petCard, pressed && styles.pressed]}>
      <View style={styles.petPhoto}>
        <PawIcon size={30} color={Palette.forestDark} />
      </View>

      <View style={styles.petInfo}>
        <Text style={styles.petName}>{pet.name}</Text>
        <Text style={styles.petDetails}>{pet.details}</Text>
        <View style={[styles.statusPill, isWarning ? styles.statusWarning : styles.statusHealthy]}>
          {isWarning ? <WarningIcon /> : <CheckIcon />}
          <Text style={styles.statusText}>{pet.status}</Text>
        </View>
      </View>

      <ChevronRightIcon />
    </Pressable>
  );
}

function QuickCareCard({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
      {icon}
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
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
  return { dateLabel, greeting };
}

export default function DashboardScreen() {
  const { dateLabel, greeting } = useNow();
  const router = useRouter();
  const addGlow = useState(() => new Animated.Value(0))[0];

  const fadeAddPet = (toValue: number) =>
    Animated.timing(addGlow, {
      toValue,
      duration: 180,
      useNativeDriver: false,
    }).start();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
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
              onPress={() => router.push('/notifications')}
              style={styles.bellButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={styles.greeting}>
            {greeting}, Raven!
          </Text>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Your pets</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/add-pet')}
              onPressIn={() => fadeAddPet(1)}
              onPressOut={() => fadeAddPet(0)}
              style={styles.addPet}>
              <Animated.View
                pointerEvents="none"
                style={[styles.addPetGlow, { opacity: addGlow }]}
              />
              <PlusIcon size={14} />
              <Text style={styles.addPetLabel}>Add pet</Text>
            </Pressable>
          </View>

          <View style={styles.petList}>
            {pets.map((pet) => (
              <PetCard
                key={pet.name}
                pet={pet}
                onPress={() => router.push({ pathname: '/pet-id', params: { name: pet.name } })}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Quick care</Text>
          <View style={styles.quickRow}>
            <QuickCareCard
              icon={<QrIcon />}
              label="View QR"
              onPress={() =>
                router.push({ pathname: '/pet-id', params: { name: pets[0]?.name } })
              }
            />
            <QuickCareCard
              icon={<HealthIcon />}
              label="Health"
              onPress={() =>
                router.push({ pathname: '/health-records', params: { name: pets[0]?.name } })
              }
            />
            <QuickCareCard
              icon={<CalendarIcon />}
              label="Reminders"
              onPress={() => router.push('/health-reminders')}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.lostButton, pressed && styles.pressed]}>
            <PinIcon />
            <Text style={styles.lostLabel}>Report Lost Pet</Text>
          </Pressable>

          <View style={styles.reminderCard}>
            <View style={styles.reminderIcon}>
              <BellIcon size={20} color={Palette.gold} />
            </View>
            <Text style={styles.reminderTitle}>Booster is due</Text>
            <Text style={styles.reminderMeta}>
              FVRCP booster · September 20 at Tagum Pet Care Clinic
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/view-reminder')}
              style={({ pressed }) => [styles.reminderButton, pressed && styles.pressed]}>
              <Text style={styles.reminderButtonLabel}>View reminder</Text>
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
  header: {
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
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    color: Palette.forestDark,
    letterSpacing: -0.5,
    marginTop: Spacing.one,
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
  sectionSpacing: {
    marginTop: Spacing.five,
  },
  addPet: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  addPetGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Palette.gold,
    borderRadius: 999,
  },
  addPetLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  petList: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    minHeight: 88,
    shadowColor: '#1B4332',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  petPhoto: {
    width: 65,
    height: 65,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInfo: {
    flex: 1,
    gap: 3,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  petDetails: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    marginTop: 3,
  },
  statusHealthy: {
    backgroundColor: Palette.sage,
  },
  statusWarning: {
    backgroundColor: Palette.goldSoft,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  quickCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Palette.sage,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  quickLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  lostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 999,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    shadowColor: '#F2B632',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lostLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  reminderCard: {
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    padding: Spacing.four,
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  reminderTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.white,
  },
  reminderMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: '#D8E2D6',
  },
  reminderButton: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
  reminderButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
