import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CameraIcon,
  ChevronDownIcon,
  PlusIcon,
  UploadIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { DateField } from '@/components/date-field';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isValidBirthdate, isValidMobile, isoToDisplayDate, toIsoDate } from '@/lib/date';
import { goBack } from '@/lib/navigation';
import { createPet, getPetById, updatePet } from '@/lib/pets';
import { useSession } from '@/lib/session';

const speciesOptions = ['Dog', 'Cat', 'Other'];
const sexOptions = ['Male', 'Female', 'Unknown'];

type FormErrors = Partial<
  Record<
    | 'name'
    | 'species'
    | 'sex'
    | 'breed'
    | 'color'
    | 'birthdate'
    | 'contactName'
    | 'contactMobile'
    | 'contactLocation',
    string
  >
>;

type DropdownFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  open: boolean;
  error?: string;
  onToggle: () => void;
  onSelect: (option: string) => void;
};

function DropdownField({
  label,
  value,
  placeholder,
  options,
  open,
  error,
  onToggle,
  onSelect,
}: DropdownFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.input,
          styles.fieldRow,
          error ? styles.inputInvalid : null,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.inputText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>
        <ChevronDownIcon />
      </Pressable>
      {open ? (
        <View style={styles.dropdown}>
          {options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => onSelect(option)}
              style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}>
              <Text style={styles.dropdownLabel}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default function AddPetScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const editing = Boolean(id);
  const session = useSession();
  const [photo, setPhoto] = useState('');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [speciesOpen, setSpeciesOpen] = useState(false);
  const [sex, setSex] = useState('');
  const [sexOpen, setSexOpen] = useState(false);
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [details, setDetails] = useState('');
  const [collar, setCollar] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactLocation, setContactLocation] = useState('');
  const [finderContactVisible, setFinderContactVisible] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const clearError = (key: keyof FormErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  useEffect(() => {
    if (editing && id) {
      void getPetById(id).then((pet) => {
        if (!pet) return;
        setPhoto(pet.photo);
        setName(pet.name);
        setSpecies(pet.species);
        setSex(pet.sex);
        setBreed(pet.breed);
        setColor(pet.color);
        setBirthdate(isoToDisplayDate(pet.birthdate));
        setDetails(pet.details);
        setCollar(pet.collar);
        setContactName(pet.contactName);
        setContactMobile(pet.contactMobile);
        setContactLocation(pet.contactLocation);
        setFinderContactVisible(pet.finderContactVisible);
      });
      return;
    }
    if (session.ready && session.user && !name.trim()) {
      if (!contactName && session.user.fullName) setContactName(session.user.fullName);
      if (!contactMobile && session.user.phoneNumber) setContactMobile(session.user.phoneNumber);
      if (!contactLocation && session.user.city) setContactLocation(session.user.city);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id, session.ready]);

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
      } else {
        setPhoto(asset.uri);
      }
    } catch {
      // Photo selection is optional; keep the previous state on failure.
    }
  };

  const save = async () => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = 'Please enter your pet\u2019s name.';
    if (!species) next.species = 'Please select a species.';
    if (!sex) next.sex = 'Please select a sex.';
    if (!breed.trim()) next.breed = 'Please enter a breed.';
    if (!color.trim()) next.color = 'Please enter a color.';
    if (!isValidBirthdate(birthdate)) next.birthdate = 'Please enter a valid birthdate.';
    if (!contactName.trim()) next.contactName = 'Please enter a contact name.';
    if (!isValidMobile(contactMobile)) next.contactMobile = 'Please enter a valid mobile number.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input = {
      name: name.trim(),
      species,
      sex,
      breed: breed.trim(),
      color: color.trim(),
      birthdate: toIsoDate(birthdate),
      photo,
      details: details.trim(),
      collar: collar.trim(),
      finderContactVisible,
      contactName: contactName.trim(),
      contactMobile: contactMobile.trim(),
      contactLocation: contactLocation.trim(),
    };

    setSaving(true);
    try {
      if (editing && id) {
        await updatePet(id, input);
      } else {
        await createPet(input);
      }
      router.replace(from === 'linked-pets' ? '/linked-pets' : '/my-pets');
    } finally {
      setSaving(false);
    }
  };

  const dirty = Boolean(
    name.trim() ||
      species ||
      sex ||
      breed.trim() ||
      color.trim() ||
      birthdate ||
      details.trim() ||
      collar.trim() ||
      contactName.trim() ||
      contactMobile.trim() ||
      contactLocation.trim() ||
      photo,
  );

  const onBack = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    goBack(editing ? '/linked-pets' : '/dashboard');
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
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>
            {editing ? 'EDIT DIGITAL PET ID' : 'NEW DIGITAL PET ID'}
          </Text>
          <Text style={styles.heading}>{editing ? 'Edit pet' : 'Add a pet'}</Text>
          <Text style={styles.supporting}>
            {editing
              ? 'Update the details behind this pet\u2019s QR tag and recovery profile.'
              : 'Their QR tag and recovery profile are created automatically.'}
          </Text>

          <Text style={styles.label}>Pet photo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoFrame}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
              ) : (
                <CameraIcon size={30} color={Palette.forestDark} />
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={pickPhoto}
              style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}>
              <UploadIcon size={18} />
              <Text style={styles.uploadLabel}>{photo ? 'Replace photo' : 'Upload photo'}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) clearError('name');
            }}
            placeholder="e.g. Bantay"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.name ? styles.inputInvalid : null]}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

          <View style={styles.fieldsRow}>
            <DropdownField
              label="Species"
              value={species}
              placeholder="Dog"
              options={speciesOptions}
              open={speciesOpen}
              error={errors.species}
              onToggle={() => {
                setSexOpen(false);
                setSpeciesOpen((open) => !open);
              }}
              onSelect={(option) => {
                setSpecies(option);
                setSpeciesOpen(false);
                clearError('species');
              }}
            />
            <DropdownField
              label="Sex"
              value={sex}
              placeholder="\u2014"
              options={sexOptions}
              open={sexOpen}
              error={errors.sex}
              onToggle={() => {
                setSpeciesOpen(false);
                setSexOpen((open) => !open);
              }}
              onSelect={(option) => {
                setSex(option);
                setSexOpen(false);
                clearError('sex');
              }}
            />
          </View>

          <Text style={styles.label}>Breed</Text>
          <TextInput
            value={breed}
            onChangeText={(value) => {
              setBreed(value);
              if (value.trim()) clearError('breed');
            }}
            placeholder="e.g. Aspin, Golden Retriever"
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, errors.breed ? styles.inputInvalid : null]}
          />
          {errors.breed ? <Text style={styles.error}>{errors.breed}</Text> : null}

          <View style={styles.fieldsRow}>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Color</Text>
              <TextInput
                value={color}
                onChangeText={(value) => {
                  setColor(value);
                  if (value.trim()) clearError('color');
                }}
                placeholder="e.g. Golden"
                placeholderTextColor={Palette.placeholder}
                style={[styles.input, errors.color ? styles.inputInvalid : null]}
              />
              {errors.color ? <Text style={styles.error}>{errors.color}</Text> : null}
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Birthdate</Text>
              <DateField
                value={birthdate}
                invalid={Boolean(errors.birthdate)}
                maximumDate={new Date()}
                accessibilityLabel="Select birthdate"
                onChange={(value) => {
                  setBirthdate(value);
                  if (value) clearError('birthdate');
                }}
              />
              {errors.birthdate ? <Text style={styles.error}>{errors.birthdate}</Text> : null}
            </View>
          </View>

          <View style={styles.detailsSection}>
            <Text style={styles.detailsLabel}>IDENTIFYING DETAILS</Text>
            <Text style={styles.detailsHint}>
              Optional details help a finder confirm it&apos;s the right pet.
            </Text>

            <Text style={styles.label}>Identifying details</Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="e.g. Black coat, small white mark on chest"
              placeholderTextColor={Palette.placeholder}
              style={[styles.input, styles.detailsTextArea]}
              multiline
            />

            <Text style={styles.label}>Collar</Text>
            <TextInput
              value={collar}
              onChangeText={setCollar}
              placeholder="e.g. Blue collar, no collar"
              placeholderTextColor={Palette.placeholder}
              style={styles.input}
            />
          </View>

          <View style={styles.recoverySection}>
            <View style={styles.recoveryHeader}>
              <Text style={styles.recoveryLabel}>RECOVERY CONTACT</Text>
              <Text style={styles.recoveryHint}>(shown to finders)</Text>
            </View>

            <Text style={styles.label}>Contact name</Text>
            <TextInput
              value={contactName}
              onChangeText={(value) => {
                setContactName(value);
                if (value.trim()) clearError('contactName');
              }}
              placeholder="Contact name"
              placeholderTextColor={Palette.placeholder}
              style={[styles.input, errors.contactName ? styles.inputInvalid : null]}
            />
            {errors.contactName ? <Text style={styles.error}>{errors.contactName}</Text> : null}

            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              value={contactMobile}
              onChangeText={(value) => {
                setContactMobile(value);
                if (value.trim()) clearError('contactMobile');
              }}
              placeholder="Mobile number, e.g. +63 917 000 0000"
              placeholderTextColor={Palette.placeholder}
              keyboardType="phone-pad"
              style={[styles.input, errors.contactMobile ? styles.inputInvalid : null]}
            />
            {errors.contactMobile ? (
              <Text style={styles.error}>{errors.contactMobile}</Text>
            ) : null}

            <Text style={styles.label}>Location / City</Text>
            <TextInput
              value={contactLocation}
              onChangeText={(value) => {
                setContactLocation(value);
                if (value.trim()) clearError('contactLocation');
              }}
              placeholder="e.g. Tagum City"
              placeholderTextColor={Palette.placeholder}
              style={[styles.input, errors.contactLocation ? styles.inputInvalid : null]}
            />
            {errors.contactLocation ? (
              <Text style={styles.error}>{errors.contactLocation}</Text>
            ) : null}

            <View style={styles.visibilityRow}>
              <View style={styles.visibilityText}>
                <Text style={styles.visibilityLabel}>Allow finder to contact me</Text>
                <Text style={styles.visibilityHint}>
                  Show this recovery contact when {name.trim() || 'the pet'}&apos;s QR is scanned.
                </Text>
              </View>
              <Switch
                value={finderContactVisible}
                onValueChange={setFinderContactVisible}
                trackColor={{ false: Palette.borderSoft, true: Palette.gold }}
                thumbColor={Palette.forestDark}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}>
            <PlusIcon size={16} />
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add pet'}</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {discardOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>Discard changes?</Text>
            <Text style={styles.discardText}>Your pet information hasn&apos;t been saved.</Text>
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
                goBack(editing ? '/linked-pets' : '/dashboard');
              }}
              style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}>
              <Text style={styles.discardLabel}>Discard</Text>
            </Pressable>
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
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  photoFrame: {
    width: 104,
    height: 104,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  uploadLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  fieldsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  fieldWrap: {
    flex: 1,
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
  inputInvalid: {
    borderColor: Palette.danger,
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
  placeholderText: {
    color: Palette.placeholder,
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
  recoverySection: {
    marginTop: Spacing.five,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  detailsSection: {
    marginTop: Spacing.five,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  detailsLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.three,
  },
  detailsHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  detailsTextArea: {
    minHeight: 60,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  recoveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  recoveryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
  },
  recoveryHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
  },
  visibilityText: {
    flex: 1,
  },
  visibilityLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  visibilityHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: 2,
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
    gap: Spacing.two,
    height: 48,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    boxShadow: '0px 4px 10px rgba(242,182,50,0.3)',
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
    alignItems: 'center',
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
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  keepLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  discardButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  discardLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});