import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';

import { BackArrow, CheckIcon, ShieldIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { registerClinicDetails } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';

function ProgressArrow({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12h13M14 7.5 18.5 12 14 16.5"
        stroke={Palette.inkMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function VetDetailsScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [vetInCharge, setVetInCharge] = useState('');
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onContinue = async () => {
    if (saving) return;
    if (!phone.trim()) {
      setSubmitError('Please enter your clinic phone number.');
      return;
    }
    if (!city.trim()) {
      setSubmitError('Please enter your city or area.');
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await registerClinicDetails({
        phone: phone.trim(),
        city: city.trim(),
        province: '',
        address: '',
        veterinarianInCharge: vetInCharge.trim(),
        license: license.trim(),
        staff: vetInCharge.trim() ? [vetInCharge.trim()] : [],
      });
      router.replace('/clinic-verification');
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Unable to save your clinic details.',
      );
    } finally {
      setSaving(false);
    }
  };

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
              onPress={() => goBack('/create-account')}
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

            <View style={styles.progress}>
              <View style={[styles.stepPill, styles.stepDone]}>
                <CheckIcon size={12} color={Palette.forestDark} />
                <Text style={styles.stepDoneLabel}>1 Account</Text>
              </View>
              <View style={styles.stepConnector}>
                <ProgressArrow />
              </View>
              <View style={[styles.stepPill, styles.stepCurrent]}>
                <Text style={styles.stepCurrentLabel}>2 Your clinic</Text>
              </View>
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>Tell us about your clinic</Text>
              <Text style={styles.subtitle}>
                These details help clients and rescue networks reach your clinic.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Clinic phone</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. +63 917 123 4567"
                  placeholderTextColor={Palette.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>City / Area</Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Tagum City"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Veterinarian in charge</Text>
                <TextInput
                  value={vetInCharge}
                  onChangeText={setVetInCharge}
                  placeholder="e.g. Dr. Maria Santos"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>License number (optional)</Text>
                <TextInput
                  value={license}
                  onChangeText={setLicense}
                  placeholder="e.g. PRC 0123456"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.privacyNote}>
              <ShieldIcon size={16} color={Palette.forestDark} />
              <Text style={styles.privacyText}>
                Clinic details stay private. Location and contact info may be shown when a lost-pet
                alert names your clinic.
              </Text>
            </View>

            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void onContinue()}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || saving) && styles.pressed,
              ]}>
              <Text style={styles.primaryLabel}>
                {saving ? 'Submitting…' : 'Continue'}
              </Text>
            </Pressable>
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
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
  },
  stepDone: {
    backgroundColor: Palette.sage,
  },
  stepDoneLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  stepCurrent: {
    backgroundColor: Palette.forestDark,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.2)',
  },
  stepCurrentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepConnector: {
    alignItems: 'center',
    justifyContent: 'center',
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
    color: Palette.forestDark,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: Palette.inkMuted,
  },
  form: {
    marginTop: Spacing.four,
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.four,
    backgroundColor: Palette.sage,
    borderRadius: 12,
    padding: Spacing.three,
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: Palette.danger,
    backgroundColor: Palette.goldSoft,
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  primaryButton: {
    height: 48,
    borderRadius: 22,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.five,
    boxShadow: '0px 4px 10px rgba(27,67,50,0.25)',
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.85,
  },
});