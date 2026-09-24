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

import { BackArrow, ChevronDownIcon, PhoneIcon, PlusIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isValidMobile } from '@/lib/date';
import { goBack } from '@/lib/navigation';
import { type EmergencyContact, updateEmergencyContact, useSession } from '@/lib/session';

const relationshipOptions = ['Family', 'Mother', 'Father', 'Sibling', 'Spouse', 'Partner', 'Friend', 'Other'];

type FormErrors = Partial<
  Record<'name' | 'mobile' | 'secondaryName' | 'secondaryMobile', string>
>;

export default function EmergencyContactScreen() {
  const { emergencyContact, ready } = useSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [relationship, setRelationship] = useState('');
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [secondaryName, setSecondaryName] = useState('');
  const [secondaryMobile, setSecondaryMobile] = useState('');
  const [secondaryRelationship, setSecondaryRelationship] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setEditable(emergencyContact);
  }, [ready, emergencyContact]);

  const setEditable = (contact: EmergencyContact | null) => {
    setName(contact?.name ?? '');
    setMobile(contact?.mobile ?? '');
    setRelationship(contact?.relationship ?? '');
    setSecondaryName(contact?.secondaryName ?? '');
    setSecondaryMobile(contact?.secondaryMobile ?? '');
    setSecondaryRelationship(contact?.secondaryRelationship ?? '');
  };

  const save = async () => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = 'Please enter a contact name.';
    if (!isValidMobile(mobile)) next.mobile = 'Please enter a valid mobile number.';
    if (secondaryName.trim() && !isValidMobile(secondaryMobile)) {
      next.secondaryMobile = 'Please enter a valid secondary mobile number.';
    }
    if (!secondaryName.trim() && secondaryMobile.trim()) {
      next.secondaryName = 'Please enter a secondary contact name.';
    }
    if (relationshipOpen) setRelationshipOpen(false);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      await updateEmergencyContact({
        name,
        mobile,
        relationship: name.trim() ? relationship.trim() || 'Family' : '',
        secondaryName: secondaryName.trim(),
        secondaryMobile: secondaryMobile.trim(),
        secondaryRelationship: secondaryRelationship.trim(),
      });
      setEditing(false);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : 'Unable to save emergency contact. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const hasContact = Boolean(emergencyContact?.name);

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
              onPress={() => goBack('/profile')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>

          <Text style={styles.category}>PROFILE</Text>
          <Text style={styles.heading}>Emergency contact</Text>
          <Text style={styles.supporting}>
            Someone we can reach if your pet needs help. Contacts are masked on your profile and
            only shared with approved recovery requests.
          </Text>

          {hasContact && !editing ? (
            <View style={styles.contactCard}>
              <View style={styles.contactIcon}>
                <PhoneIcon size={24} color={Palette.forestDark} />
              </View>
              <View style={styles.contactBody}>
                <Text style={styles.contactName}>{emergencyContact?.name}</Text>
                <Text style={styles.contactMobile}>{emergencyContact?.mobile}</Text>
                <Text style={styles.contactRelation}>{emergencyContact?.relationship}</Text>
                {emergencyContact?.secondaryName ? (
                  <View style={styles.secondaryRow}>
                    <Text style={styles.secondaryLabel}>Secondary</Text>
                    <View>
                      <Text style={styles.secondaryName}>{emergencyContact?.secondaryName}</Text>
                      <Text style={styles.secondaryMobile}>{emergencyContact?.secondaryMobile}</Text>
                      <Text style={styles.secondaryRelation}>
                        {emergencyContact?.secondaryRelationship}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {!hasContact ? (
            <Text style={styles.emptyText}>No emergency contact set yet.</Text>
          ) : null}

          {!hasContact || editing ? (
            <View style={styles.form}>
              <Text style={styles.label}>Contact name</Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (errors.name && value.trim()) {
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="e.g. Maria Babiano"
                placeholderTextColor={Palette.placeholder}
                style={[styles.input, errors.name ? styles.inputInvalid : null]}
              />
              {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

              <Text style={styles.label}>Mobile number</Text>
              <TextInput
                value={mobile}
                onChangeText={(value) => {
                  setMobile(value);
                  if (errors.mobile && value.trim()) {
                    setErrors((prev) => ({ ...prev, mobile: undefined }));
                  }
                }}
                placeholder="e.g. +63 917 123 4567"
                placeholderTextColor={Palette.placeholder}
                keyboardType="phone-pad"
                style={[styles.input, errors.mobile ? styles.inputInvalid : null]}
              />
              {errors.mobile ? <Text style={styles.error}>{errors.mobile}</Text> : null}

              <Text style={styles.label}>Relationship</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRelationshipOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.input,
                  styles.fieldRow,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.inputText, !relationship && styles.placeholderText]}>
                  {relationship || 'Select a relationship'}
                </Text>
                <ChevronDownIcon />
              </Pressable>
              {relationshipOpen ? (
                <View style={styles.dropdown}>
                  {relationshipOptions.map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      onPress={() => {
                        setRelationship(option);
                        setRelationshipOpen(false);
                      }}
                      style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}>
                      <Text style={styles.dropdownLabel}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setSecondaryOpen((open) => !open)}
                style={({ pressed }) => [styles.secondaryToggle, pressed && styles.pressed]}>
                <Text style={styles.secondaryToggleLabel}>
                  {secondaryOpen ? 'Hide secondary contact' : 'Add a secondary contact'}
                </Text>
              </Pressable>

              {secondaryOpen ? (
                <View style={styles.secondarySection}>
                  <Text style={styles.label}>Secondary name</Text>
                  <TextInput
                    value={secondaryName}
                    onChangeText={(value) => {
                      setSecondaryName(value);
                      if (errors.secondaryName && value.trim()) {
                        setErrors((prev) => ({ ...prev, secondaryName: undefined }));
                      }
                    }}
                    placeholder="Secondary contact name"
                    placeholderTextColor={Palette.placeholder}
                    style={[styles.input, errors.secondaryName ? styles.inputInvalid : null]}
                  />
                  {errors.secondaryName ? (
                    <Text style={styles.error}>{errors.secondaryName}</Text>
                  ) : null}

                  <Text style={styles.label}>Secondary mobile</Text>
                  <TextInput
                    value={secondaryMobile}
                    onChangeText={(value) => {
                      setSecondaryMobile(value);
                      if (errors.secondaryMobile && value.trim()) {
                        setErrors((prev) => ({ ...prev, secondaryMobile: undefined }));
                      }
                    }}
                    placeholder="e.g. +63 917 765 4321"
                    placeholderTextColor={Palette.placeholder}
                    keyboardType="phone-pad"
                    style={[styles.input, errors.secondaryMobile ? styles.inputInvalid : null]}
                  />
                  {errors.secondaryMobile ? (
                    <Text style={styles.error}>{errors.secondaryMobile}</Text>
                  ) : null}

                  <Text style={styles.label}>Secondary relationship</Text>
                  <TextInput
                    value={secondaryRelationship}
                    onChangeText={setSecondaryRelationship}
                    placeholder="e.g. Father"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                </View>
              ) : null}

              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

              <Pressable
                accessibilityRole="button"
                onPress={save}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  (pressed || saving) && styles.pressed,
                ]}>
                <PlusIcon size={16} />
                <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save contact'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => goBack('/profile')}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditable(emergencyContact);
                setEditing(true);
                setErrors({});
                setSaveError(null);
              }}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
              <Text style={styles.editLabel}>Edit contact</Text>
            </Pressable>
          )}
        </ScrollView>

        <BottomNav active="profile" />
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
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
    marginTop: Spacing.four,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    marginTop: Spacing.four,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.06)',
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBody: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  contactMobile: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: Palette.inkMuted,
    marginTop: 2,
  },
  contactRelation: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  secondaryRow: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
    gap: 2,
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Palette.forestDark,
  },
  secondaryName: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  secondaryMobile: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  secondaryRelation: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  form: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.two,
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
  secondaryToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  secondaryToggleLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  secondarySection: {
    gap: Spacing.three,
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
    marginTop: Spacing.two,
    boxShadow: '0px 4px 10px rgba(242,182,50,0.3)',
  },
  saveLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  cancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  editButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    marginTop: Spacing.four,
  },
  editLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '800',
    color: Palette.white,
  },
  pressed: {
    opacity: 0.85,
  },
});