import { Href, useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BellIcon,
  ChevronRightIcon,
  GearIcon,
  LogoutIcon,
  PawIcon,
  PhoneIcon,
  ProfileIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage, useAuth } from "@/services/auth-context";
import { listPets, peekPetsCached } from "@/services/pets";

function SettingsCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.cardIcon}>{icon}</View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      {onPress ? <ChevronRightIcon /> : null}
    </>
  );

  if (!onPress) return <View style={styles.card}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const session = state.status === "ready" ? state.session : null;

  const [petCount, setPetCount] = useState<number | null>(() => {
    const cached = peekPetsCached();
    return cached ? cached.length : null;
  });
  const [petsError, setPetsError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listPets()
        .then((pets) => {
          if (!active) return;
          setPetCount(pets.length);
          setPetsError("");
        })
        .catch((error) => {
          if (!active) return;
          setPetCount(null);
          setPetsError(authErrorMessage(error));
        });
      return () => {
        active = false;
      };
    }, [retryKey]),
  );

  async function handleLogout() {
    setPending(true);
    setLogoutError("");
    try {
      await signOut();
    } catch (error) {
      setLogoutError(authErrorMessage(error));
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Profile</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push("/notifications")}
              style={styles.iconButton}
            >
              <BellIcon />
            </Pressable>
          </View>

          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <ProfileIcon size={30} color={Palette.white} />
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.name}>
                {session?.displayName || "Pet Owner"}
              </Text>
              <Text style={styles.role}>Pet Owner</Text>
              <Text style={styles.email}>{session?.email}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.cardList}>
            <SettingsCard
              icon={<PhoneIcon />}
              title="Contact number"
              subtitle={session?.phone || "Not added"}
            />
            <SettingsCard
              icon={<PawIcon size={22} />}
              title="Pets"
              subtitle={
                petsError ||
                (petCount === null
                  ? "Loading..."
                  : `${petCount} ${petCount === 1 ? "pet" : "pets"}`)
              }
              onPress={() =>
                petsError
                  ? setRetryKey((key) => key + 1)
                  : router.navigate("/my-pets")
              }
            />
            <SettingsCard
              icon={<GearIcon />}
              title="Privacy & preferences"
              subtitle="Recovery sharing, clinic access, permissions"
              onPress={() => router.push("/privacy-settings" as Href)}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={() => setConfirming(true)}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.pressed,
            ]}
          >
            <LogoutIcon />
            <Text style={styles.logoutLabel}>Log out</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="profile" />
      </SafeAreaView>

      {confirming ? (
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Log out of PetConnect?</Text>
            <Text style={styles.dialogText}>
              You will need to sign in again to manage your pets.
            </Text>
            {logoutError ? (
              <Text accessibilityRole="alert" style={styles.dialogError}>
                {logoutError}
              </Text>
            ) : null}
            <View style={styles.dialogButtons}>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                onPress={() => setConfirming(false)}
                style={styles.dialogCancel}
              >
                <Text style={styles.dialogCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                onPress={() => void handleLogout()}
                style={styles.dialogConfirm}
              >
                {pending ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text style={styles.dialogConfirmLabel}>Log out</Text>
                )}
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
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  header: {
    minHeight: 48,
    marginTop: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  identityCard: {
    marginTop: Spacing.four,
    borderRadius: 20,
    backgroundColor: Palette.forestDark,
    padding: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  identityBody: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: Fonts.sans,
    fontSize: 21,
    fontWeight: "800",
    color: Palette.white,
  },
  role: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.sage,
  },
  email: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.sage,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.inkMuted,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  cardList: {
    gap: Spacing.two,
  },
  card: {
    minHeight: 74,
    borderRadius: 17,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  cardSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  logoutButton: {
    minHeight: 50,
    marginTop: Spacing.five,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.dangerSoft,
    backgroundColor: "rgba(255,255,255,0.68)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  logoutLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.danger,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(20,28,23,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
  },
  dialog: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    padding: Spacing.four,
  },
  dialogTitle: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  dialogText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  dialogError: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.danger,
    marginTop: Spacing.three,
  },
  dialogButtons: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  dialogCancel: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogCancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  dialogConfirm: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Palette.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogConfirmLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.white,
  },
  pressed: {
    opacity: 0.82,
  },
});
