import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CheckIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { updateClinicInfo, useClinicProfile } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';

export default function ClinicEditScreen() {
  const router = useRouter();
  const clinic = useClinicProfile();

  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [address, setAddress] = useState('');
  const [vetInCharge, setVetInCharge] = useState('');
  const [license, setLicense] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'phone' | 'city', string>>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clinic) return;
    setPhone(clinic.phone);
    setCity(clinic.city);
    setProvince(clinic.province);
    setAddress(clinic.address);
    setVetInCharge(clinic.veterinarianInCharge);
    setLicense(clinic.license);
  }, [clinic?.clinicId]);

  if (!clinic) return null;

  const save = async () => {
    const next: typeof errors = {};
    if (!phone.trim()) next.phone = 'Phone number is required.';
    if (!city.trim()) next.city = 'City is required.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await updateClinicInfo({
        phone: phone.trim(),
        city: city.trim(),
        province: province.trim(),
        address: address.trim(),
        veterinarianInCharge: vetInCharge.trim(),
        license: license.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace('/clinic-profile');
      }, 1100);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/clinic-profile')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · PROFILE</Text>
          <Text style={styles.heading}>Edit clinic info</Text>
          <Text style={styles.supporting}>
            Keep {clinic.clinicName}&apos;s contact details and credentials up to date.
          </Text>

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              if (value.trim()) setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            placeholder="e.g. +63 917 555 0042"
            placeholderTextColor={Palette.placeholder}
            keyboardType="phone-pad"
            style={[styles.input, errors.phone ? styles.inputInvalid : null]}
          />
          {errors.phone ? <Text style={styles.error}>{errors.phone}</Text> : null}

          <Text style={styles.label}>City</Text>
          <TextInput
            value={city}
            onChangeText={(value) => {
              setCity(value);
              if (value.trim()) setErrors((prev) => ({ ...prev, city: undefined }));
            }}
            placeholder="e.g. Tagum City"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.city ? styles.inputInvalid : null]}
          />
          {errors.city ? <Text style={styles.error}>{errors.city}</Text> : null}

          <Text style={styles.label}>Province</Text>
          <TextInput
            value={province}
            onChangeText={setProvince}
            placeholder="e.g. Davao del Norte"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Veterinarian in charge</Text>
          <TextInput
            value={vetInCharge}
            onChangeText={setVetInCharge}
            placeholder="e.g. Dr. Maria Santos"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>License number</Text>
          <TextInput
            value={license}
            onChangeText={setLicense}
            placeholder="e.g. PRC 0001234"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}>
            <CheckIcon size={16} color={Palette.forestDark} />
            <Text style={styles.saveLabel}>Save changes</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="profile" />
      </SafeAreaView>

      {success ? (
        <View style={styles.overlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIcon}>
              <CheckIcon size={20} color={Palette.white} />
            </View>
            <Text style={styles.successTitle}>Clinic info updated</Text>
            <Text style={styles.successText}>Your clinic details have been saved.</Text>
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
    fontSize: 27,
    lineHeight: 34,
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
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  input: {
    minHeight: 46,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  inputInvalid: {
    borderColor: Palette.danger,
  },
  textArea: {
    minHeight: 80,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 48,
    borderRadius: 22,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  saveLabel: {
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
  successSheet: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  successTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  successText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});