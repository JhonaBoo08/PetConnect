import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CheckIcon, PlusIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { DateField } from '@/components/date-field';
import { TimeField } from '@/components/time-field';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { parseDisplayDate, toIsoDate } from '@/lib/date';
import {
  createReminder,
  recordTypes,
  reminderNotificationTimings,
  useHealthRecords,
  useHealthReminders,
  type ReminderNotificationTiming,
} from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { usePets } from '@/lib/pets';

type FormErrors = Partial<Record<'pet' | 'name' | 'date' | 'time', string>>;

function nameLabelFor(type: string): string {
  return type === 'Medication' ? 'Medication name' : 'Reminder name';
}

function placeholderFor(type: string): string {
  switch (type) {
    case 'Medication':
      return 'e.g. Deworming tablet';
    case 'Checkup':
      return 'e.g. Annual wellness check';
    case 'Other':
      return 'e.g. Grooming session';
    default:
      return 'e.g. FVRCP booster';
  }
}

export default function AddReminderScreen() {
  const router = useRouter();
  const pets = usePets();
  const records = useHealthRecords();
  const reminders = useHealthReminders();

  const [petId, setPetId] = useState('');
  const [type, setType] = useState(recordTypes[0]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [clinic, setClinic] = useState('');
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState<ReminderNotificationTiming>(
    reminderNotificationTimings[1],
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!petId && pets.length > 0) setPetId(pets[0].id);
  }, [pets, petId]);

  const selectedPet = pets.find((pet) => pet.id === petId) ?? null;

  const clearError = (key: keyof FormErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const clinicSuggestions = Array.from(
    new Set(
      [
        ...records.map((record) => record.veterinaryClinic.trim()),
        ...reminders.map((reminder) => reminder.clinicName.trim()),
      ].filter((value) => value && value !== clinic.trim()),
    ),
  ).slice(0, 4);

  const dirty = Boolean(name.trim() || date || time || clinic.trim() || notes.trim());

  const onBack = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    goBack('/health-reminders');
  };

  const save = async () => {
    const next: FormErrors = {};
    if (!selectedPet) next.pet = 'Please choose a pet.';
    if (!name.trim()) next.name = `${nameLabelFor(type)} is required.`;
    if (!date) next.date = 'Date is required.';
    else if (!parseDisplayDate(date)) next.date = 'Please enter a valid date.';
    if (!time) next.time = 'Time is required.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !selectedPet) return;

    setSaving(true);
    try {
      await createReminder({
        petId: selectedPet.id,
        petName: selectedPet.name,
        title: name.trim(),
        type,
        dueDate: toIsoDate(date),
        time,
        notificationTiming: notify,
        clinicName: clinic.trim(),
        description: notes.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace('/health-reminders');
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

          <Text style={styles.category}>NEW HEALTH REMINDER</Text>
          <Text style={styles.heading}>Add health reminder</Text>
          <Text style={styles.supporting}>
            Schedule a vaccination, checkup, or treatment so you never miss it.
          </Text>

          <Text style={styles.label}>Pet</Text>
          {pets.length > 0 ? (
            <View style={styles.chipRow}>
              {pets.map((pet) => {
                const isActive = pet.id === petId;
                return (
                  <Pressable
                    key={pet.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      setPetId(pet.id);
                      clearError('pet');
                    }}
                    style={[styles.chip, isActive && styles.chipActive]}>
                    <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                      {pet.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.error}>No pets found. Add a pet first.</Text>
          )}
          {errors.pet ? <Text style={styles.error}>{errors.pet}</Text> : null}

          <Text style={styles.label}>Reminder type</Text>
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
            placeholder="e.g. Oct 5, 2026"
            format="long"
            accessibilityLabel="Select reminder date"
            onChange={(value) => {
              setDate(value);
              if (value) clearError('date');
            }}
          />
          {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}

          <Text style={styles.label}>Time</Text>
          <TimeField
            value={time}
            invalid={Boolean(errors.time)}
            onChange={(value) => {
              setTime(value);
              if (value) clearError('time');
            }}
          />
          {errors.time ? <Text style={styles.error}>{errors.time}</Text> : null}

          <Text style={styles.label}>Veterinary clinic</Text>
          <TextInput
            value={clinic}
            onChangeText={setClinic}
            placeholder="e.g. Tagum Pet Care Clinic"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />
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
            placeholder="Anything to remember for this visit..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Notification timing</Text>
          <View style={styles.segment}>
            {reminderNotificationTimings.map((option) => {
              const isActive = notify === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setNotify(option)}
                  style={[styles.segmentItem, isActive && styles.segmentItemActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving || pets.length === 0}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving || pets.length === 0) && styles.pressed,
            ]}>
            <PlusIcon size={16} />
            <Text style={styles.saveLabel}>Save reminder</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {discardOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>Discard reminder?</Text>
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
                goBack('/health-reminders');
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
            <Text style={styles.successTitle}>Reminder saved</Text>
            <Text style={styles.successText}>
              {selectedPet?.name}&apos;s reminder is now on your schedule.
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: Palette.forestDark,
    borderColor: Palette.forestDark,
  },
  chipLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  chipLabelActive: {
    color: Palette.white,
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
