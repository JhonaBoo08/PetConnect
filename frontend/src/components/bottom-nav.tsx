import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { type ComponentType, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPendingTab(null);
    }, []),
  );

  function goToTab(key: TabKey) {
    if (key === active || pendingTab) return;
    setPendingTab(key);
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => {});
    }
    requestAnimationFrame(() => router.navigate(tabRoutes[key]));
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
      style={styles.bottomNav}
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{
              selected: isActive,
              busy: pendingTab === key,
              disabled: pendingTab !== null,
            }}
            aria-selected={isActive}
            disabled={pendingTab !== null}
            onPress={() => goToTab(key)}
            style={({ pressed }) => [
              styles.navItem,
              pressed && !isActive && styles.navItemPressed,
            ]}
          >
            <View
              style={[
                styles.navInner,
                isActive && styles.navInnerActive,
                pendingTab === key && styles.navInnerPending,
              ]}
            >
              {pendingTab === key ? (
                <ActivityIndicator size="small" color={Palette.forestDark} />
              ) : (
                <Icon
                  size={key === "pets" ? 20 : 21}
                  color={isActive ? Palette.white : Palette.inkMuted}
                />
              )}
              <Text
                style={[
                  styles.navLabel,
                  isActive && styles.navLabelActive,
                  pendingTab === key && styles.navLabelPending,
                ]}
              >
                {pendingTab === key ? "Opening…" : label}
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
  navItemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
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
  navInnerPending: {
    backgroundColor: Palette.sage,
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
  navLabelPending: {
    color: Palette.forestDark,
    fontWeight: "800",
  },
});
