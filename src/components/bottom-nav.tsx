import { useRouter } from 'expo-router';
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

const tabRoutes: Partial<Record<TabKey, '/dashboard' | '/scan' | '/alerts' | '/profile'>> = {
  home: '/dashboard',
  scan: '/scan',
  alerts: '/alerts',
  profile: '/profile',
};

const tabs: { key: TabKey; label: string; Icon: ComponentType<IconProps> }[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'scan', label: 'Scan', Icon: QrIcon },
  { key: 'alerts', label: 'Alerts', Icon: BellIcon },
  { key: 'profile', label: 'Profile', Icon: ProfileIcon },
];

export function BottomNav({ active }: { active: TabKey }) {
  const router = useRouter();

  return (
    <View style={styles.bottomNav}>
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const route = tabRoutes[key];
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (route) {
                router.navigate(route);
              }
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
