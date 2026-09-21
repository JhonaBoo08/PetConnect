import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PawIcon,
  ShieldIcon,
  UploadIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

const speciesOptions = ['Dog', 'Cat', 'Bird', 'Other'];
const sexOptions = ['Male', 'Female'];

export default function AddPetScreen() {
  const router = useRouter();
  const [photoAdded, setPhotoAdded] = useState(false);
  const [name, setName] = useState('');
  const [speciesOpen, setSpeciesOpen] = useState(false);
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string; species?: string }>({});
  const [petId] = useState('PC-TAG-10484');

  const save = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Please enter your pet\u2019s name.';
    if (!species) next.species = 'Please select a species.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      router.navigate('/dashboard');
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
              onPress={() => goBack('/dashboard')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>PET PROFILE</Text>
          <Text style={styles.heading}>Add a pet</Text>
          <Text style={styles.supporting}>
            Register your pet&apos;s details so it can be identified and reunited if lost.
          </Text>

          <View style={styles.photoPreview}>
            <View style={styles.photoThumb}>
              <PawIcon size={34} color={Palette.forestDark} />
            </View>
            <View style={styles.photoInfo}>
              <Text style={styles.photoTitle}>
                {photoAdded ? 'pet_photo.jpg' : 'No photo yet'}
              </Text>
              <Text style={styles.photoHint}>A clear photo helps people recognize your pet.</Text>
            </View>
            {photoAdded ? (
              <Pressable accessibilityRole="button" onPress={() => setPhotoAdded(false)}>
                <Text style={styles.photoRemove}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPhotoAdded(true)}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
            <UploadIcon />
            <Text style={styles.photoLabel}>
              {photoAdded ? 'Replace photo' : 'Add pet photo'}
            </Text>
          </Pressable>

          <Text style={styles.label}>Pet name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Bantay"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

          <Text style={styles.label}>Species</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSpeciesOpen((open) => !open)}
            style={[styles.input, styles.fieldRow]}>
            <Text style={styles.inputText}>{species || 'Select species'}</Text>
            <ChevronDownIcon />
          </Pressable>
          {speciesOpen ? (
            <View style={styles.dropdown}>
              {speciesOptions.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => {
                    setSpecies(option);
                    setSpeciesOpen(false);
                    setErrors((prev) => ({ ...prev, species: undefined }));
                  }}
                  style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}>
                  <Text style={styles.dropdownLabel}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {errors.species ? <Text style={styles.error}>{errors.species}</Text> : null}

          <Text style={styles.label}>Breed</Text>
          <TextInput
            value={breed}
            onChangeText={setBreed}
            placeholder="e.g. Golden Retriever"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Sex</Text>
          <View style={styles.segment}>
            {sexOptions.map((option) => {
              const isActive = sex === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setSex(option)}
                  style={[styles.segmentItem, isActive && styles.segmentItemActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Age</Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="e.g. 3 years"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Identifying details</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Collar, markings, temperament..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <View style={styles.idPanel}>
            <ShieldIcon size={22} />
            <View style={styles.idText}>
              <Text style={styles.idLabel}>UNIQUE PET ID</Text>
              <Text style={styles.idValue}>{petId}</Text>
            </View>
            <CheckIcon size={16} color={Palette.forestDark} />
          </View>
          <Text style={styles.idHint}>
            This Pet-Connect ID is generated automatically and links to your pet&apos;s QR code.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={save}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveLabel}>Save pet</Text>
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    padding: Spacing.two,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInfo: {
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  photoHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  photoRemove: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.danger,
    paddingHorizontal: Spacing.two,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    marginTop: Spacing.three,
  },
  photoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
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
    minHeight: 44,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
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
  dropdown: {
    marginTop: Spacing.two,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  dropdownLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: Palette.white,
  },
  idPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.goldTrack,
    borderRadius: 12,
    padding: Spacing.three,
  },
  idText: {
    flex: 1,
    gap: 2,
  },
  idLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  idValue: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
    letterSpacing: 0.5,
  },
  idHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    shadowColor: '#F2B632',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
