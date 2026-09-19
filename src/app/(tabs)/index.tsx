import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinderIcon } from '@/components/pet-logo';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

const palette = {
  cream: '#F8F0DF',
  border: '#46584B',
  forestDark: '#1B4332',
  sage: '#DCE7DA',
  sagePressed: '#CBDCCC',
  inkMuted: '#5C6356',
};

const ButtonMargin = 30;
const ButtonHeight = 56;

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
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.two,
  },
  logoCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B4332',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    marginBottom: Spacing.two,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 62,
  },
  appName: {
    fontFamily: Fonts.sans,
    fontSize: 40,
    lineHeight: 48,
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
  actions: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  primaryButton: {
    height: ButtonHeight,
    marginHorizontal: ButtonMargin,
    borderRadius: 999,
    backgroundColor: palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B4332',
    shadowOpacity: 0.25,
    shadowRadius: 10,
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
    marginHorizontal: ButtonMargin,
    borderRadius: 999,
    backgroundColor: palette.sage,
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