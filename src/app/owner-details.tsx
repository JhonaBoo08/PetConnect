import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { isValidMobile } from '@/lib/date';
import { goBack } from '@/lib/navigation';
import { completeOwnerDetails, useSession } from '@/lib/session';

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

export default function OwnerDetailsScreen() {
  const router = useRouter();
  const { user, emergencyContact, ready } = useSession();
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [relationship, setRelationship] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (user?.phoneNumber) setMobile(user.phoneNumber);
    if (user?.city) setCity(user.city);
    if (user?.province) setProvince(user.province);
    if (emergencyContact?.name) setContactName(emergencyContact.name);
    if (emergencyContact?.mobile) setContactNumber(emergencyContact.mobile);
    if (emergencyContact?.relationship) setRelationship(emergencyContact.relationship);
  }, [ready, user, emergencyContact]);

  const continueFlow = async () => {
    let message: string | null = null;
    if (!isValidMobile(mobile)) {
      message = 'Please enter a valid mobile number.';
    } else if (!city.trim()) {
      message = 'Please enter your city / area.';
    } else if (contactName.trim() && !isValidMobile(contactNumber)) {
      message = 'Please enter a valid emergency contact number.';
    } else if (!contactName.trim() && contactNumber.trim()) {
      message = 'Please enter an emergency contact name.';
    }
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    try {
      await completeOwnerDetails({
        phoneNumber: mobile,
        city: city.trim(),
        province: province.trim(),
        contactName: contactName.trim() || '',
        contactMobile: contactNumber.trim() || '',
        relationship: contactName.trim() ? relationship.trim() || 'Family' : '',
        secondaryName: '',
        secondaryMobile: '',
        secondaryRelationship: '',
      });
      router.replace('/add-pet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save your details right now.');
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
                <Text style={styles.stepCurrentLabel}>2 Your details</Text>
              </View>
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>Tell us about you</Text>
              <Text style={styles.subtitle}>
                A few details help us keep your account and pets connected.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  value={mobile}
                  onChangeText={setMobile}
                  placeholder="e.g. +63 917 123 4567"
                  placeholderTextColor={Palette.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldsRow}>
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>City / Area</Text>
                  <TextInput
                    value={city}
                    onChangeText={setCity}
                    placeholder="e.g. Tagum City"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Province</Text>
                  <TextInput
                    value={province}
                    onChangeText={setProvince}
                    placeholder="e.g. Davao del Norte"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                </View>
              </View>
            </View>

            <View style={styles.emergencyPanel}>
              <Text style={styles.emergencyHeading}>Emergency contact</Text>
              <Text style={styles.emergencySupporting}>
                Someone we can contact if your pet needs help. You can update this later.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Contact name</Text>
                <TextInput
                  value={contactName}
                  onChangeText={setContactName}
                  placeholder="e.g. Maria Babiano"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Contact number</Text>
                <TextInput
                  value={contactNumber}
                  onChangeText={setContactNumber}
                  placeholder="e.g. +63 9XX XXX XXXX"
                  placeholderTextColor={Palette.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Relationship (optional)</Text>
                <TextInput
                  value={relationship}
                  onChangeText={setRelationship}
                  placeholder="e.g. Mother, Partner, Friend"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.privacyNote}>
              <ShieldIcon size={16} color={Palette.forestDark} />
              <Text style={styles.privacyText}>
                Your information stays private. Only recovery-safe details may be shared when your
                pet is reported lost or found.
              </Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              onPress={continueFlow}
              disabled={saving}
              style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.pressed]}>
              <Text style={styles.primaryLabel}>
                {saving ? 'Saving…' : 'Continue'}
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
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  fieldWrap: {
    flex: 1,
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
  emergencyPanel: {
    marginTop: Spacing.five,
    backgroundColor: Palette.segmentTrack,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  emergencyHeading: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  emergencySupporting: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    marginTop: -Spacing.one,
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
  error: {
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