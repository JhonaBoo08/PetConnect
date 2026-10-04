import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinderIcon } from '@/components/pet-logo';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

const palette = {
  cream: '#F8F0DF',
  forestDark: '#1B4332',
  sagePressed: '#CBDCCC',
  inkMuted: '#5C6356',
};

const ButtonHeight = 54;

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>

          <Text style={styles.appName}>Pet-Connect</Text>
          <Text style={styles.tagline}>Scan, Protect, Reconnect.</Text>
          <Text style={styles.description}>
            One caring network for pet identity, health, and safe reunions across Tagum City.
          </Text>

          <View style={styles.valueStrip}>
            <Text style={styles.valueText}>Digital ID</Text>
            <View style={styles.valueDot} />
            <Text style={styles.valueText}>Recovery</Text>
            <View style={styles.valueDot} />
            <Text style={styles.valueText}>Care</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>Get Started&ensp;›</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <FinderIcon size={20} />
            <Text style={styles.secondaryLabel}>I found a pet</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.cream,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.five,
  },
  logoCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B4332',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
    marginBottom: Spacing.two,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
  },
  appName: {
    fontFamily: Fonts.sans,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: '800',
    color: palette.forestDark,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    color: palette.forestDark,
    textAlign: 'center',
  },
  description: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: palette.inkMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  valueStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFDF7',
    borderWidth: 1,
    borderColor: '#C7CDC0',
  },
  valueText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: palette.inkMuted,
  },
  valueDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.forestDark,
    opacity: 0.45,
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  primaryButton: {
    height: ButtonHeight,
    borderRadius: 16,
    backgroundColor: palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B4332',
    shadowOpacity: 0.22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: ButtonHeight,
    borderRadius: 16,
    backgroundColor: '#FFFDF7',
    borderWidth: 1,
    borderColor: '#C7CDC0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '700',
    color: palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
