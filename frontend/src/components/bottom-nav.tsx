import { useRouter } from "expo-router";
import { type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  HomeIcon,
  PawIcon,
  PinIcon,
  type IconProps,
  ProfileIcon,
  QrIcon,
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, Spacing } from "@/constants/theme";

export type TabKey = "home" | "pets" | "scan" | "recovery" | "profile";

const tabRoutes: Record<
  TabKey,
  "/dashboard" | "/my-pets" | "/scan" | "/alerts" | "/profile"
> = {
  home: "/dashboard",
  pets: "/my-pets",
  scan: "/scan",
  recovery: "/alerts",
  profile: "/profile",
};

const tabs: { key: TabKey; label: string; Icon: ComponentType<IconProps> }[] = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "pets", label: "Pets", Icon: PawIcon },
  { key: "scan", label: "Scan", Icon: QrIcon },
  { key: "recovery", label: "Recovery", Icon: PinIcon },
  { key: "profile", label: "Profile", Icon: ProfileIcon },
];

export function BottomNav({ active }: { active: TabKey }) {
  const router = useRouter();

  return (
    <View accessibilityRole="tablist" accessibilityLabel="Main navigation" style={styles.bottomNav}>
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => router.navigate(tabRoutes[key])}
            style={styles.navItem}
          >
            <View style={[styles.navInner, isActive && styles.navInnerActive]}>
              <Icon
                size={key === "pets" ? 20 : 21}
                color={isActive ? Palette.white : Palette.inkMuted}
              />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
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
    marginHorizontal: Spacing.two,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 24,
    backgroundColor: Palette.surface,
    paddingHorizontal: 6,
    paddingVertical: 7,
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
    paddingHorizontal: 3,
    paddingVertical: Spacing.one,
    borderRadius: 17,
  },
  navInnerActive: {
    backgroundColor: Palette.forestDark,
  },
  navLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: "600",
    color: Palette.inkMuted,
  },
  navLabelActive: {
    fontWeight: "800",
    color: Palette.white,
  },
});
