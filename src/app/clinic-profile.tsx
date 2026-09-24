import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  ChevronRightIcon,
  GearIcon,
  ListIcon,
  LogoutIcon,
  ProfileIcon,
  ShieldIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useClinicProfile, useClinicProfiles } from '@/lib/clinic';
import { useClinicNotifications } from '@/lib/clinic-notifications';
import { goBack } from '@/lib/navigation';
import { logout, useSession } from '@/lib/session';

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SettingsCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardIcon}>{icon}</View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

export default function ClinicProfileScreen() {
  const router = useRouter();
  const { ready } = useSession();
  const { ready: clinicReady } = useClinicProfiles();
  const clinic = useClinicProfile();
  const notifications = useClinicNotifications();
  const [confirming, setConfirming] = useState(false);

  const unread = notifications.filter((notification) => notification.unread).length;
  const location = [clinic?.city, clinic?.province].filter(Boolean).join(', ') || 'Location not set';

  if (!ready || !clinicReady || !clinic) return null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/clinic')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={styles.iconButton}>
              <BellIcon />
              {unread > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeLabel}>{unread}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · PROFILE</Text>
          <Text style={styles.name}>{clinic.clinicName}</Text>
          <Text style={styles.email}>{clinic.email}</Text>
          {clinic.verificationStatus === 'verified' ? (
            <View style={styles.verifiedPill}>
              <ShieldIcon size={16} />
              <Text style={styles.verifiedPillLabel}>VERIFIED CLINIC</Text>
            </View>
          ) : (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingPillLabel}>PENDING VERIFICATION</Text>
            </View>
          )}

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <ShieldIcon size={26} color={Palette.white} />
            </View>
            <View>
              <Text style={styles.profileRole}>Veterinary Clinic</Text>
              <Text style={styles.profileLocation}>{location}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>CLINIC DETAILS</Text>
          <View style={styles.detailCard}>
            <DetailRow label="Email" value={clinic.email} />
            <DetailRow label="Phone" value={clinic.phone} />
            <DetailRow label="Address" value={clinic.address} />
            <DetailRow label="Veterinarian in charge" value={clinic.veterinarianInCharge} />
            <DetailRow label="License" value={clinic.license} />
          </View>

          <Text style={styles.sectionLabel}>STAFF</Text>
          <View style={styles.staffCard}>
            {clinic.staff.length > 0 ? (
              clinic.staff.map((member) => (
                <View key={member} style={styles.staffRow}>
                  <View style={styles.staffIcon}>
                    <ProfileIcon size={18} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.staffName}>{member}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.staffEmpty}>No staff members added yet.</Text>
            )}
          </View>

          <View style={styles.cardList}>
            <SettingsCard
              icon={<ProfileIcon size={22} />}
              title="Edit clinic info"
              subtitle="Clinic details, contact, license"
              onPress={() => router.push('/clinic-edit')}
            />
            <SettingsCard
              icon={<ListIcon size={20} />}
              title="Manage staff"
              subtitle={`${clinic.staff.length} ${clinic.staff.length === 1 ? 'member' : 'members'}`}
              onPress={() => router.push('/clinic-staff')}
            />
            <SettingsCard
              icon={<GearIcon />}
              title="Preferences"
              subtitle="Alerts and notifications"
              onPress={() => router.push('/clinic-preferences')}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(true)}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}>
            <LogoutIcon />
            <Text style={styles.logoutLabel}>Log out</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="profile" />
      </SafeAreaView>

      {confirming ? (
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Log out?</Text>
            <Text style={styles.dialogText}>
              Are you sure you want to log out of the {clinic.clinicName} workspace?
            </Text>
            <View style={styles.dialogButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirming(false)}
                style={({ pressed }) => [styles.dialogCancel, pressed && styles.pressed]}>
                <Text style={styles.dialogCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  setConfirming(false);
                  try {
                    await logout();
                  } finally {
                    router.replace('/');
                  }
                }}
                style={({ pressed }) => [styles.dialogConfirm, pressed && styles.pressed]}>
                <Text style={styles.dialogConfirmLabel}>Log out</Text>
              </Pressable>
            </View>
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
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Palette.gold,
    borderWidth: 1.5,
    borderColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  name: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  email: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    marginTop: Spacing.three,
  },
  verifiedPillLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Palette.forestDark,
  },
  pendingPill: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    marginTop: Spacing.three,
  },
  pendingPillLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Palette.forestDark,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 86,
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.four,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRole: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.white,
  },
  profileLocation: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#C9DBC6',
    marginTop: 3,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  detailCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 15,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: Palette.inkMuted,
  },
  detailValue: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    textAlign: 'right',
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
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  staffEmpty: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    padding: Spacing.three,
  },
  cardList: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 15,
    paddingHorizontal: Spacing.three,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.05)',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  cardSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.goldTrack,
    backgroundColor: Palette.cream,
    marginTop: Spacing.five,
  },
  logoutButtonPressed: {
    backgroundColor: Palette.gold,
    borderColor: Palette.gold,
  },
  logoutLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.danger,
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
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.surface,
    borderRadius: 18,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  dialogTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  dialogText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: Palette.inkMuted,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  dialogCancel: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  dialogConfirm: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.white,
  },
  pressed: {
    opacity: 0.85,
  },
});