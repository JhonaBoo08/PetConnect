import { useRouter } from "expo-router";
import { type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  BellIcon,
  HomeIcon,
  type IconProps,
  ProfileIcon,
  QrIcon,
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, Spacing } from "@/constants/theme";

export type TabKey = "home" | "scan" | "alerts" | "profile";

const tabRoutes: Partial<
  Record<TabKey, "/dashboard" | "/scan" | "/alerts" | "/profile">
> = {
  home: "/dashboard",
  scan: "/scan",
  alerts: "/alerts",
  profile: "/profile",
};

const tabs: { key: TabKey; label: string; Icon: ComponentType<IconProps> }[] = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "scan", label: "Scan", Icon: QrIcon },
  { key: "alerts", label: "Alerts", Icon: BellIcon },
  { key: "profile", label: "Profile", Icon: ProfileIcon },
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
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (route) {
                router.navigate(route);
              }
            }}
            style={styles.navItem}
          >
            <View style={[styles.navInner, isActive && styles.navInnerActive]}>
              <Icon
                size={22}
                color={isActive ? Palette.white : Palette.inkMuted}
              />
              <Text
                style={[styles.navLabel, isActive && styles.navLabelActive]}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 24,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.two,
    paddingVertical: 7,
    gap: Spacing.one,
    elevation: 5,
  },
  navItem: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  navInner: {
    width: "100%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 18,
  },
  navInnerActive: {
    backgroundColor: Palette.forestDark,
  },
  navLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "600",
    color: Palette.inkMuted,
  },
  navLabelActive: {
    fontWeight: "800",
    color: Palette.white,
  },
});
