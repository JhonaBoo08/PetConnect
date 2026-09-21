import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BackArrow, BellIcon, HealthIcon, PawIcon, ShareIcon, ShieldIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type PetProfile = {
  breed: string;
  meta: string;
  id: string;
  photo: string;
};

const petProfiles: Record<string, PetProfile> = {
  Bantay: {
    breed: 'Golden Retriever',
    meta: 'Male · 3 years old',
    id: 'PC-TAG-10482',
    photo: 'Bantay',
  },
  Mingming: {
    breed: 'Orange Tabby',
    meta: 'Female · 2 years old',
    id: 'PC-TAG-10483',
    photo: 'Mingming',
  },
};

const QR_GRID = 21;

function buildQrMatrix(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const random = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) % 1000) / 1000;
  };
  const cells: boolean[][] = [];
  for (let r = 0; r < QR_GRID; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < QR_GRID; c += 1) {
      row.push(random() > 0.5);
    }
    cells.push(row);
  }
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        cells[r0 + r][c0 + c] = edge || core;
      }
    }
  };
  finder(0, 0);
  finder(0, QR_GRID - 7);
  finder(QR_GRID - 7, 0);
  return cells;
}

function qrPath(seed: string, size: number) {
  const matrix = buildQrMatrix(seed);
  const cell = size / QR_GRID;
  let d = '';
  for (let r = 0; r < QR_GRID; r += 1) {
    for (let c = 0; c < QR_GRID; c += 1) {
      if (matrix[r][c]) {
        const x = (c * cell).toFixed(2);
        const y = (r * cell).toFixed(2);
        const s = cell.toFixed(2);
        d += `M${x} ${y}h${s}v${s}h-${s}z`;
      }
    }
  }
  return d;
}

function QrCode({ seed, size = 72 }: { seed: string; size?: number }) {
  const pad = size * 0.08;
  const inner = size - pad * 2;
  return (
    <View style={[styles.qrWrap, { width: size, height: size }]}>
      <Svg width={inner} height={inner} viewBox={`0 0 ${inner} ${inner}`}>
        <Path d={qrPath(seed, inner)} fill={Palette.forestDark} />
      </Svg>
    </View>
  );
}

export default function PetIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const requested = Array.isArray(params.name) ? params.name[0] : params.name;
  const petName = requested ?? 'Bantay';
  const profile = petProfiles[petName] ?? petProfiles.Bantay;

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
              <PawIcon size={64} color={Palette.forestDark} />
              <Text style={styles.photoCaption}>{profile.photo}</Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.breedRow}>
                <Text style={styles.breed}>{profile.breed}</Text>
                <ShieldIcon size={24} />
              </View>
              <Text style={styles.meta}>{profile.meta}</Text>

              <View style={styles.idPanel}>
                <View style={styles.idText}>
                  <Text style={styles.idLabel}>UNIQUE PET ID</Text>
                  <Text style={styles.idValue}>{profile.id}</Text>
                </View>
                <QrCode seed={profile.id} size={72} />
              </View>
            </View>
          </View>

          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryLabel}>RECOVERY CONTACT</Text>
            <Text style={styles.recoveryName}>Raven Babiano</Text>
            <Text style={styles.recoveryMeta}>+63 917 ··· ··42 · Tagum City</Text>
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
                <PawIcon size={40} color={Palette.forestDark} />
              </View>
              <Text style={styles.shareName}>{petName}</Text>
              <Text style={styles.shareMeta}>{profile.breed}</Text>
              <QrCode seed={profile.id} size={96} />
              <Text style={styles.shareId}>{profile.id}</Text>
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
  qrWrap: {
    backgroundColor: Palette.surface,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  shareName: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.white,
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
