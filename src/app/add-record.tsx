import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CheckIcon, PlusIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { DateField } from '@/components/date-field';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isoToDisplayDate, parseDisplayDate, toIsoDate } from '@/lib/date';
import {
  createHealthRecord,
  recordTypes,
  type NewHealthRecordInput,
  updateHealthRecord,
  useHealthRecords,
} from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { seedPets, usePets } from '@/lib/pets';

type FormErrors = Partial<Record<'name' | 'date' | 'clinic', string>>;

function nameLabelFor(type: string): string {
  return type === 'Medication' ? 'Medication name' : 'Record name';
}

function placeholderFor(type: string): string {
  switch (type) {
    case 'Medication':
      return 'e.g. Antibiotic';
    case 'Checkup':
      return 'e.g. Annual Checkup';
    case 'Other':
      return 'e.g. Grooming';
    default:
      return 'e.g. Deworming';
  }
}

export default function AddRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; record?: string }>();
  const petName = Array.isArray(params.name) ? params.name[0] : params.name ?? 'Bantay';
  const editId = Array.isArray(params.record) ? params.record[0] : params.record;

  const pets = usePets();
  const records = useHealthRecords();
  const editRecord = editId ? records.find((record) => record.id === editId) ?? null : null;

  const [type, setType] = useState(recordTypes[0]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [clinic, setClinic] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!editRecord || hydrated.current) return;
    hydrated.current = true;
    setType(editRecord.recordType);
    setName(editRecord.recordName);
    setDate(editRecord.recordDate ? isoToDisplayDate(editRecord.recordDate) : '');
    setClinic(editRecord.veterinaryClinic);
    setNotes(editRecord.notes);
    setNextDue(editRecord.nextDueDate ? isoToDisplayDate(editRecord.nextDueDate) : '');
  }, [editRecord]);

  const clearError = (key: keyof FormErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const clinicSuggestions = Array.from(
    new Set(
      records
        .map((record) => record.veterinaryClinic.trim())
        .filter((value) => value && value !== clinic.trim()),
    ),
  ).slice(0, 4);

  const dirty = Boolean(
    name.trim() || date || clinic.trim() || notes.trim() || nextDue,
  );

  const onBack = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    goBack('/health-records');
  };

  const save = async () => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = `${nameLabelFor(type)} is required.`;
    if (!date) next.date = 'Date is required.';
    else if (!parseDisplayDate(date)) next.date = 'Please enter a valid date.';
    if (!clinic.trim()) next.clinic = 'Veterinary clinic is required.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const pet =
      pets.find((candidate) => candidate.name === petName) ??
      seedPets.find((candidate) => candidate.name === petName);
    const input: NewHealthRecordInput = {
      petId: pet?.id ?? '',
      petName,
      recordType: type,
      recordName: name.trim(),
      recordDate: toIsoDate(date),
      veterinaryClinic: clinic.trim(),
      notes: notes.trim(),
      nextDueDate: nextDue ? toIsoDate(nextDue) : null,
    };

    setSaving(true);
    try {
      if (editRecord) {
        await updateHealthRecord(editRecord.id, input);
      } else {
        await createHealthRecord(input);
      }
      setSuccess(true);
      setTimeout(() => {
        router.replace({ pathname: '/health-records', params: { name: petName } });
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
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>ADD HEALTH RECORD</Text>
          <Text style={styles.heading}>
            {editRecord ? 'Edit health record' : 'Add health record'}
          </Text>
          <Text style={styles.supporting}>
            Vaccines, checkups, and treatments stay in {petName}&apos;s health history.
          </Text>

          <Text style={styles.label}>Record type</Text>
          <View style={styles.segment}>
            {recordTypes.map((option) => {
              const isActive = type === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setType(option)}
                  style={[styles.segmentItem, isActive && styles.segmentItemActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{nameLabelFor(type)}</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) clearError('name');
            }}
            placeholder={placeholderFor(type)}
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.name ? styles.inputInvalid : null]}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

          <Text style={styles.label}>Date</Text>
          <DateField
            value={date}
            invalid={Boolean(errors.date)}
            placeholder="e.g. Aug 14, 2026"
            format="long"
            maximumDate={new Date()}
            accessibilityLabel="Select record date"
            onChange={(value) => {
              setDate(value);
              if (value) clearError('date');
            }}
          />
          {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}

          <Text style={styles.label}>Veterinary clinic</Text>
          <TextInput
            value={clinic}
            onChangeText={(value) => {
              setClinic(value);
              if (value.trim()) clearError('clinic');
            }}
            placeholder="e.g. Tagum Pet Care Clinic"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.clinic ? styles.inputInvalid : null]}
          />
          {errors.clinic ? <Text style={styles.error}>{errors.clinic}</Text> : null}
          {clinicSuggestions.length > 0 ? (
            <View style={styles.suggestionRow}>
              {clinicSuggestions.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setClinic(option)}
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}>
                  <Text style={styles.suggestionLabel}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Weight, observations, reactions..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Next due date</Text>
          <DateField
            value={nextDue}
            onChange={setNextDue}
            placeholder="e.g. Sep 20, 2027 (optional)"
            format="long"
            accessibilityLabel="Select next due date"
            onClear={() => setNextDue('')}
          />
          <Text style={styles.hint}>A health reminder is created automatically if set.</Text>

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}>
            <PlusIcon size={16} />
            <Text style={styles.saveLabel}>
              {editRecord ? 'Update health record' : 'Save health record'}
            </Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {discardOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>Discard health record?</Text>
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
                goBack('/health-records');
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
            <Text style={styles.successTitle}>Health record saved</Text>
            <Text style={styles.successText}>{petName}&apos;s health record has been updated.</Text>
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
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    backgroundColor: Palette.goldTrack,
    borderRadius: 14,
    padding: 4,
  },
  segmentItem: {
    paddingHorizontal: Spacing.three,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: Palette.white,
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