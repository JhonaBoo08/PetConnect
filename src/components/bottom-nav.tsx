import { useRouter, type Href } from 'expo-router';
import { type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BellIcon,
  HomeIcon,
  type IconProps,
  ProfileIcon,
  QrIcon,
} from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';

export type TabKey = 'home' | 'scan' | 'alerts' | 'profile';
export type ClinicTabKey = 'clinic' | 'scan' | 'updates' | 'profile';
export type ActiveTab = TabKey | ClinicTabKey;

type TabItem = { key: TabKey | ClinicTabKey; label: string; route: Href; Icon: ComponentType<IconProps> };

const ownerTabs: TabItem[] = [
  { key: 'home', label: 'Home', route: '/dashboard', Icon: HomeIcon },
  { key: 'scan', label: 'Scan', route: '/scan', Icon: QrIcon },
  { key: 'alerts', label: 'Alerts', route: '/alerts', Icon: BellIcon },
  { key: 'profile', label: 'Profile', route: '/profile', Icon: ProfileIcon },
];

const clinicTabs: TabItem[] = [
  { key: 'clinic', label: 'Clinic', route: '/clinic', Icon: HomeIcon },
  { key: 'scan', label: 'Scan', route: '/scan', Icon: QrIcon },
  { key: 'updates', label: 'Updates', route: '/clinic-notifications', Icon: BellIcon },
  { key: 'profile', label: 'Profile', route: '/clinic-profile', Icon: ProfileIcon },
];

export function BottomNav({
  active,
  variant = 'owner',
}: {
  active: ActiveTab;
  variant?: 'owner' | 'clinic';
}) {
  const router = useRouter();
  const tabs = variant === 'clinic' ? clinicTabs : ownerTabs;

  return (
    <View style={styles.bottomNav}>
      {tabs.map(({ key, label, route, Icon }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              router.navigate(route);
            }}
            style={styles.navItem}>
            <View style={[styles.navInner, isActive && styles.navInnerActive]}>
              <Icon size={22} color={isActive ? Palette.forestDark : Palette.inkMuted} />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  navInnerActive: {
    backgroundColor: Palette.sage,
  },
  navLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    color: Palette.inkMuted,
  },
  navLabelActive: {
    fontWeight: '800',
    color: Palette.forestDark,
  },
});