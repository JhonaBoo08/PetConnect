import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

export const authPalette = {
  cream: '#F8F0DF',
  surface: '#FFFDF7',
  border: '#46584B',
  borderSoft: '#C7CDC0',
  forestDark: '#1B4332',
  sage: '#DCE7DA',
  segmentTrack: '#EDE6D5',
  inkMuted: '#5C6356',
  placeholder: '#9AA093',
};

export type AccountType = 'owner' | 'vet';

function BackArrow({ size = 22, color = authPalette.forestDark }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PawIcon({ size = 16, color = authPalette.forestDark }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={7} cy={8.5} r={2.4} />
      <Circle cx={12} cy={6.5} r={2.4} />
      <Circle cx={17} cy={8.5} r={2.4} />
      <Path d="M12 11.5c-3.2 0-5.6 2.1-5.6 4.5 0 1.7 1.3 2.9 3 2.9 1 0 1.7-.4 2.6-.4s1.6.4 2.6.4c1.7 0 3-1.2 3-2.9 0-2.4-2.4-4.5-5.6-4.5z" />
    </Svg>
  );
}

function VetIcon({ size = 16, color = authPalette.forestDark }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={10} y={3.5} width={4} height={17} rx={1.6} />
      <Rect x={3.5} y={10} width={17} height={4} rx={1.6} />
    </Svg>
  );
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C40.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

export function AuthFooter({
  text,
  linkLabel,
  onPress,
}: {
  text: string;
  linkLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.footerRow}>
      <Text style={styles.footerText}>{text}</Text>
      <Pressable accessibilityRole="link" onPress={onPress}>
        <Text style={styles.footerLink}>{linkLabel}</Text>
      </Pressable>
    </View>
  );
}

type AuthScreenProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  clinicNote?: string;
  footer: ReactNode;
  onBack: () => void;
};

export function AuthScreen({
  title,
  subtitle,
  submitLabel,
  clinicNote,
  footer,
  onBack,
}: AuthScreenProps) {
  const [accountType, setAccountType] = useState<AccountType>('owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={10}
              onPress={onBack}
              style={styles.backButton}>
              <BackArrow />
            </Pressable>

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

            <View style={styles.heading}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            <View style={styles.segment}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: accountType === 'owner' }}
                onPress={() => setAccountType('owner')}
                style={[styles.segmentItem, accountType === 'owner' && styles.segmentItemActive]}>
                <PawIcon color={accountType === 'owner' ? '#FFFFFF' : authPalette.forestDark} />
                <Text
                  style={[
                    styles.segmentLabel,
                    accountType === 'owner' && styles.segmentLabelActive,
                  ]}>
                  Pet Owner
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: accountType === 'vet' }}
                onPress={() => setAccountType('vet')}
                style={[styles.segmentItem, accountType === 'vet' && styles.segmentItemActive]}>
                <VetIcon color={accountType === 'vet' ? '#FFFFFF' : authPalette.forestDark} />
                <Text
                  style={[styles.segmentLabel, accountType === 'vet' && styles.segmentLabelActive]}>
                  Vet Clinic
                </Text>
              </Pressable>
            </View>

            {clinicNote && accountType === 'vet' ? (
              <Text style={styles.clinicNote}>{clinicNote}</Text>
            ) : null}

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={authPalette.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={authPalette.placeholder}
                  secureTextEntry
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryLabel}>{submitLabel}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}>
              <GoogleIcon />
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </Pressable>

            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: authPalette.cream,
    borderWidth: 1,
    borderColor: authPalette.border,
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
    paddingBottom: Spacing.six,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    marginLeft: -Spacing.two,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
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
    color: authPalette.forestDark,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    color: authPalette.inkMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  heading: {
    marginTop: Spacing.five,
    gap: Spacing.one,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    color: authPalette.forestDark,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: authPalette.inkMuted,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: authPalette.segmentTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.four,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  segmentItemActive: {
    backgroundColor: authPalette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: authPalette.forestDark,
  },
  segmentLabelActive: {
    color: '#FFFFFF',
  },
  clinicNote: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: authPalette.inkMuted,
    marginTop: Spacing.three,
  },
  form: {
    marginTop: Spacing.five,
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: authPalette.forestDark,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: authPalette.borderSoft,
    backgroundColor: authPalette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: authPalette.forestDark,
  },
  primaryButton: {
    height: 48,
    borderRadius: 22,
    backgroundColor: authPalette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.five,
    shadowColor: '#1B4332',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  googleButton: {
    height: 48,
    borderRadius: 22,
    backgroundColor: authPalette.surface,
    borderWidth: 1,
    borderColor: authPalette.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  googleLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
    color: authPalette.forestDark,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  footerText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: authPalette.inkMuted,
  },
  footerLink: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: authPalette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
