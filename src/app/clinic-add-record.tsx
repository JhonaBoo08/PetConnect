import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CheckIcon, PawIcon, ShieldIcon, SyringeIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { DateField } from '@/components/date-field';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { getClinicAccessSync } from '@/lib/clinic-access';
import { useClinicGate, useClinicProfile } from '@/lib/clinic';
import { addClinicNotification } from '@/lib/clinic-notifications';
import { isoToLongDate, isoToDisplayDate, parseDisplayDate, toIsoDate } from '@/lib/date';
import { createHealthRecord, useHealthRecords } from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { addNotification } from '@/lib/notifications';
import { usePetById } from '@/lib/pets';

type FormErrors = Partial<Record<'name' | 'date', string>>;

export default function ClinicAddRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string }>();
  const petIdParam = Array.isArray(params.pet) ? params.pet[0] : (params.pet ?? '');
  const pet = usePetById(petIdParam);
  const clinic = useClinicProfile();
  const records = useHealthRecords();
  useClinicGate();

  const access = clinic ? getClinicAccessSync(clinic.clinicId, petIdParam) : null;

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (clinic && pet && access && access.status !== 'active') {
      router.replace({ pathname: '/clinic-scan-result', params: { pet: pet.id } });
    }
  }, [clinic, pet, access, router]);

  useEffect(() => {
    if (!clinic || hydrated.current) return;
    hydrated.current = true;
    setDate(isoToDisplayDate(new Date().toISOString().slice(0, 10)));
  }, [clinic]);

  if (pet === undefined || !clinic) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <ActivityIndicator color={Palette.forestDark} />
            <Text style={styles.emptyText}>Loading pet records…</Text>
          </View>
          <BottomNav variant="clinic" active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.centerIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Pet profile not found.</Text>
            <Text style={styles.emptyText}>
              This Pet-Connect ID could not be matched to a pet profile.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack({ pathname: '/clinic-records', params: { pet: petIdParam } })}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backLabel}>Go back</Text>
            </Pressable>
          </View>
          <BottomNav variant="clinic" active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (!access || access.status !== 'active') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.centerIcon}>
              <ShieldIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Access not yet granted.</Text>
            <Text style={styles.emptyText}>
              You need owner-approved access to update {pet.name}&apos;s records.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack({ pathname: '/clinic-records', params: { pet: pet.id } })}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backLabel}>Back to records</Text>
            </Pressable>
          </View>
          <BottomNav variant="clinic" active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  const clearError = (key: keyof FormErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const vaccineSuggestions = Array.from(
    new Set(
      records
        .filter((record) => record.recordType === 'Vaccination')
        .map((record) => record.recordName.trim())
        .filter((value) => value && value !== name.trim()),
    ),
  ).slice(0, 4);

  const dirty = Boolean(name.trim() || date || nextDue || notes.trim());

  const onBack = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    goBack({ pathname: '/clinic-records', params: { pet: pet.id } });
  };

  const save = async () => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = 'Vaccine name is required.';
    if (!date) next.date = 'Date is required.';
    else if (!parseDisplayDate(date)) next.date = 'Please enter a valid date.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const record = await createHealthRecord({
        petId: pet.id,
        petName: pet.name,
        recordType: 'Vaccination',
        recordName: name.trim(),
        recordDate: toIsoDate(date),
        veterinaryClinic: clinic.clinicName,
        notes: notes.trim(),
        nextDueDate: nextDue ? toIsoDate(nextDue) : null,
        clinicId: clinic.clinicId,
      });

      await addNotification({
        kind: 'record',
        title: `${pet.name}'s vaccine updated`,
        description:
          `${clinic.clinicName} updated ${record.recordName} on ` +
          `${isoToLongDate(record.recordDate)}.`,
        timestamp: 'Just now',
        route: { pathname: '/record-details', params: { record: record.id, name: pet.name } },
      });

      await addClinicNotification({
        kind: 'record',
        title: 'Vaccine updated',
        description: `${pet.name}'s ${record.recordName} was logged for ${clinic.clinicName}.`,
        timestamp: 'Just now',
      });

      setSuccess(true);
      setTimeout(() => {
        router.replace({ pathname: '/clinic-records', params: { pet: pet.id } });
      }, 1200);
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
              onPress={onBack}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · UPDATE VACCINE</Text>
          <Text style={styles.heading}>Update {pet.name}&apos;s vaccine</Text>
          <Text style={styles.supporting}>
            Log a vaccination from {clinic.clinicName}. The owner is notified when a record
            is updated.
          </Text>

          <Text style={styles.label}>Vaccine name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) clearError('name');
            }}
            placeholder="e.g. Anti-Rabies"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.name ? styles.inputInvalid : null]}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}
          {vaccineSuggestions.length > 0 ? (
            <View style={styles.suggestionRow}>
              {vaccineSuggestions.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setName(option)}
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}>
                  <Text style={styles.suggestionLabel}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Date administered</Text>
          <DateField
            value={date}
            invalid={Boolean(errors.date)}
            placeholder="e.g. Aug 14, 2026"
            format="long"
            maximumDate={new Date()}
            accessibilityLabel="Select date administered"
            onChange={(value) => {
              setDate(value);
              if (value) clearError('date');
            }}
          />
          {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}

          <Text style={styles.label}>Next due date</Text>
          <DateField
            value={nextDue}
            onChange={setNextDue}
            placeholder="e.g. Sep 20, 2027 (optional)"
            format="long"
            accessibilityLabel="Select next due date"
            onClear={() => setNextDue('')}
          />
          <Text style={styles.hint}>A booster reminder is created automatically if set.</Text>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Dose, reaction, observations..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}>
            <SyringeIcon size={16} color={Palette.forestDark} />
            <Text style={styles.saveLabel}>Update {pet.name}&apos;s vaccine</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="scan" />
      </SafeAreaView>

      {discardOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>Discard vaccine update?</Text>
            <Text style={styles.discardText}>Your changes haven&apos;t been saved.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDiscardOpen(false)}
              style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
              <Text style={styles.keepLabel}>Keep editing</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDiscardOpen(false);
                goBack({ pathname: '/clinic-records', params: { pet: pet.id } });
              }}
              style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}>
              <Text style={styles.discardLabel}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {success ? (
        <View style={styles.overlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIcon}>
              <CheckIcon size={20} color={Palette.white} />
            </View>
            <Text style={styles.successTitle}>Vaccine updated</Text>
            <Text style={styles.successText}>
              {pet.name}&apos;s {name.trim()} record has been logged. The owner has been
              notified.
            </Text>
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
    minHeight: 96,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  suggestionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  suggestionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.forestDark,
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
  discardSheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  discardTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  discardText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  keepButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  keepLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  discardButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
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