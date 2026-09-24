import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutIcon, ShieldIcon, WarningIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useClinicProfile, useClinicProfiles } from '@/lib/clinic';
import { logout, useSession } from '@/lib/session';

export default function ClinicVerificationScreen() {
  const router = useRouter();
  const { ready } = useSession();
  const { ready: clinicReady } = useClinicProfiles();
  const clinic = useClinicProfile();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    if (ready && clinicReady) {
      if (clinic?.verificationStatus === 'verified') {
        router.replace('/clinic');
        return;
      }
      setStatus('ready');
    }
  }, [ready, clinicReady, clinic, router]);

  const signOut = async () => {
    try {
      await logout();
    } finally {
      router.replace('/');
    }
  };

  if (status !== 'ready') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.stateWrap}>
            <View style={styles.stateIcon}>
              <ShieldIcon size={30} color={Palette.forestDark} />
            </View>
            <Text style={styles.stateTitle}>Loading verification status…</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <LogoutIcon />
              <Text style={styles.secondaryLabel}>Sign out</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!clinic) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.stateIcon}>
              <ShieldIcon size={30} color={Palette.forestDark} />
            </View>
            <Text style={styles.title}>Clinic profile not found</Text>
            <Text style={styles.text}>
              We couldn&apos;t find your clinic details. Complete your clinic registration to
              continue, or sign out and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/vet-details')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryLabel}>Complete clinic details</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <LogoutIcon />
              <Text style={styles.secondaryLabel}>Sign out</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const rejected = clinic.verificationStatus === 'rejected';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.centerWrap}>
            <View style={[styles.stateIcon, rejected && styles.stateIconWarn]}>
              {rejected ? (
                <WarningIcon size={30} color={Palette.forestDark} />
              ) : (
                <ShieldIcon size={30} color={Palette.forestDark} />
              )}
            </View>

            <Text style={styles.title}>
              {rejected ? 'Verification not approved' : 'Verification in progress'}
            </Text>

            <Text style={styles.text}>
              {rejected
                ? `${clinic.clinicName}'s details could not be verified. Update your clinic info or contact support for help.`
                : `${clinic.clinicName} is being reviewed. Your clinic workspace will unlock as soon as verification is complete.`}
            </Text>

            <View style={styles.stepList}>
              <View style={styles.stepRow}>
                <View style={styles.stepDot} />
                <Text style={styles.stepText}>Profile submitted for review</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepDot} />
                <Text style={styles.stepText}>License and clinic details checked</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepDot} />
                <Text style={styles.stepText}>Workspace unlocked once verified</Text>
              </View>
            </View>

            {rejected ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/clinic-edit')}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryLabel}>Update clinic info</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <LogoutIcon />
              <Text style={styles.secondaryLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
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
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  stateIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIconWarn: {
    backgroundColor: Palette.goldSoft,
    borderColor: Palette.gold,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Palette.forestDark,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  stateTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  text: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: 'center',
    maxWidth: 330,
  },
  stepList: {
    alignSelf: 'stretch',
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.gold,
  },
  stepText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 22,
    backgroundColor: Palette.gold,
    alignSelf: 'stretch',
    marginTop: Spacing.two,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignSelf: 'stretch',
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});