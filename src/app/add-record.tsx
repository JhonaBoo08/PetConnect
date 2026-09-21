import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, PlusIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

const recordTypes = ['Vaccination', 'Checkup', 'Medication', 'Other'];

export default function AddRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const petName = Array.isArray(params.name) ? params.name[0] : params.name ?? 'Bantay';

  const [type, setType] = useState(recordTypes[0]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [clinic, setClinic] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const save = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Please enter the record name.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      router.replace({ pathname: '/health-records', params: { name: petName } });
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
              onPress={() => goBack('/health-records')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/alerts')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>ADD HEALTH RECORD</Text>
          <Text style={styles.heading}>Add health record</Text>
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

          <Text style={styles.label}>Record name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Deworming"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

          <Text style={styles.label}>Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="e.g. Aug 14, 2026"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Veterinary clinic</Text>
          <TextInput
            value={clinic}
            onChangeText={setClinic}
            placeholder="e.g. Tagum Pet Care Clinic"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

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
          <TextInput
            value={nextDue}
            onChangeText={setNextDue}
            placeholder="e.g. Sep 20, 2027 (optional)"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Pressable
            accessibilityRole="button"
            onPress={save}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <PlusIcon size={16} />
            <Text style={styles.saveLabel}>Save health record</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>
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
  pressed: {
    opacity: 0.85,
  },
});