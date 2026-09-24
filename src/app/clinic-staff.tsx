import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, PlusIcon, ProfileIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { updateClinicStaff, useClinicProfile } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';

export default function ClinicStaffScreen() {
  const router = useRouter();
  const clinic = useClinicProfile();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!clinic) return null;

  const addMember = async () => {
    const name = draft.trim();
    if (!name) {
      setError('Staff name is required.');
      return;
    }
    if (clinic.staff.some((member) => member.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already on your staff list.`);
      return;
    }
    setBusy(true);
    try {
      await updateClinicStaff([...clinic.staff, name]);
      setDraft('');
      setError('');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (name: string) => {
    setBusy(true);
    try {
      await updateClinicStaff(clinic.staff.filter((member) => member !== name));
    } finally {
      setBusy(false);
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
          <Text style={styles.heading}>Manage staff</Text>
          <Text style={styles.supporting}>
            Add or remove team members associated with {clinic.clinicName}.
          </Text>

          <Text style={styles.label}>Current staff</Text>
          <View style={styles.staffCard}>
            {clinic.staff.length > 0 ? (
              clinic.staff.map((member) => (
                <View key={member} style={styles.staffRow}>
                  <View style={styles.staffIcon}>
                    <ProfileIcon size={18} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.staffName}>{member}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${member}`}
                    disabled={busy}
                    onPress={() => void removeMember(member)}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                    <Text style={styles.removeLabel}>Remove</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.staffEmpty}>No staff members yet. Add one below.</Text>
            )}
          </View>

          <Text style={styles.label}>Add a staff member</Text>
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                if (value.trim()) setError('');
              }}
              placeholder="e.g. Dr. Ana Lim"
              placeholderTextColor={Palette.placeholder}
              style={[styles.addInput, error ? styles.inputInvalid : null]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add staff member"
              disabled={busy}
              onPress={() => void addMember()}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <PlusIcon size={16} color={Palette.forestDark} />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <BottomNav variant="clinic" active="profile" />
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
  staffCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 15,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  staffIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffName: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  removeButton: {
    paddingHorizontal: Spacing.three,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.goldTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.danger,
  },
  staffEmpty: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    padding: Spacing.three,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addInput: {
    flex: 1,
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
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
});