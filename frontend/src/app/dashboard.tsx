import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
  CalendarIcon,
  ChevronRightIcon,
  PawIcon,
  PinIcon,
  PlusIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage, useAuth } from "@/services/auth-context";
import {
  listAppointments,
  listHealthReminders,
} from "@/services/health-clinic";
import { listPets, petPhotoUri } from "@/services/pets";
import type {
  Appointment,
  HealthReminder,
  Pet,
} from "../../../shared/contracts";

type CarePreviewItem = {
  id: string;
  petName: string;
  petId: string;
  title: string;
  at: string;
  kind: "reminder" | "appointment";
};

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function useNow() {
  const now = new Date();
  const dateLabel = `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { dateLabel, greeting };
}

function toCarePreview(
  reminders: HealthReminder[],
  appointments: Appointment[],
): CarePreviewItem[] {
  const now = Date.now();
  return [
    ...reminders
      .filter(
        (item) =>
          item.status === "PENDING" && new Date(item.dueAt).getTime() >= now,
      )
      .map((item) => ({
        id: item.id,
        petName: item.petName,
        petId: item.petId,
        title: item.title,
        at: item.dueAt,
        kind: "reminder" as const,
      })),
    ...appointments
      .filter(
        (item) =>
          (item.status === "REQUESTED" || item.status === "SCHEDULED") &&
          new Date(item.appointmentDate).getTime() >= now,
      )
      .map((item) => ({
        id: item.id,
        petName: item.petName,
        petId: item.petId,
        title: item.reason || `Appointment at ${item.clinic.name}`,
        at: item.appointmentDate,
        kind: "appointment" as const,
      })),
  ]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 3);
}

function formatCareDate(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export default function DashboardScreen() {
  const { dateLabel, greeting } = useNow();
  const { state } = useAuth();
  const router = useRouter();
  const firstName =
    state.status === "ready"
      ? state.session.displayName.split(" ")[0]
      : "there";

  const [pets, setPets] = useState<Pet[]>([]);
  const [care, setCare] = useState<CarePreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [petsError, setPetsError] = useState("");
  const [careError, setCareError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      const now = new Date();
      const end = new Date(now);
      end.setTime(now.getTime() + 60 * 86400000);
      const range = { from: now.toISOString(), to: end.toISOString() };

      Promise.allSettled([
        listPets(),
        Promise.all([
          listHealthReminders(undefined, range),
          listAppointments(range),
        ]),
      ]).then((results) => {
        if (!active) return;

        const [petsResult, careResult] = results;
        if (petsResult.status === "fulfilled") {
          setPets(petsResult.value);
          setPetsError("");
        } else {
          setPetsError(authErrorMessage(petsResult.reason));
        }

        if (careResult.status === "fulfilled") {
          setCare(toCarePreview(careResult.value[0], careResult.value[1]));
          setCareError("");
        } else {
          setCareError(authErrorMessage(careResult.reason));
        }

        setLoading(false);
      });

      return () => {
        active = false;
      };
    }, [retryKey]),
  );

  function reportLost() {
    if (pets.length === 0) {
      router.push("/add-pet");
      return;
    }
    if (pets.length === 1) {
      router.push({
        pathname: "/alerts",
        params: { mode: "report", petId: pets[0].id },
      });
      return;
    }
    router.push({ pathname: "/my-pets", params: { action: "lost" } });
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image
                  source={require("@/assets/images/logo.png")}
                  style={styles.brandMarkImage}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.brandName}>PetConnect</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push("/notifications")}
              style={styles.iconButton}
            >
              <BellIcon />
            </Pressable>
          </View>

          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={styles.greeting}>
            {greeting}, {firstName}!
          </Text>

          {loading ? (
            <ActivityIndicator color={Palette.forestDark} style={styles.loader} />
          ) : null}

          {petsError ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {petsError}
              </Text>
              <Pressable onPress={() => setRetryKey((value) => value + 1)}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !petsError && pets.length === 0 ? (
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeIcon}>
                <PawIcon size={28} />
              </View>
              <Text style={styles.welcomeTitle}>Add your first pet</Text>
              <Text style={styles.welcomeText}>
                Create a Pet ID, keep health records together, and enable
                recovery if your pet ever goes missing.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add your first pet"
                onPress={() => router.push("/add-pet")}
                style={styles.primaryButton}
              >
                <PlusIcon size={18} color={Palette.white} />
                <Text style={styles.primaryButtonText}>Add your first pet</Text>
              </Pressable>
            </View>
          ) : null}

          {pets.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your pets</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/my-pets")}
                  style={styles.textAction}
                >
                  <Text style={styles.textActionLabel}>See all</Text>
                  <ChevronRightIcon size={16} />
                </Pressable>
              </View>

              <View style={styles.petList}>
                {pets.slice(0, 2).map((pet) => (
                  <Pressable
                    key={pet.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${pet.name}`}
                    onPress={() =>
                      router.push({ pathname: "/pet-id", params: { id: pet.id } })
                    }
                    style={({ pressed }) => [
                      styles.petCard,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.petPhoto}>
                      {pet.photoUrl ? (
                        <Image
                          source={{ uri: petPhotoUri(pet.photoUrl)! }}
                          style={styles.petPhotoImage}
                          contentFit="cover"
                        />
                      ) : (
                        <PawIcon size={24} />
                      )}
                    </View>
                    <View style={styles.petBody}>
                      <Text style={styles.petName}>{pet.name}</Text>
                      <Text style={styles.petMeta}>
                        {[pet.breed || pet.species, pet.sex, pet.ageLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <ChevronRightIcon />
                  </Pressable>
                ))}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Up next</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/care-calendar")}
                  style={styles.textAction}
                >
                  <Text style={styles.textActionLabel}>Care</Text>
                  <ChevronRightIcon size={16} />
                </Pressable>
              </View>

              <View style={styles.careCard}>
                {careError ? (
                  <Text accessibilityRole="alert" style={styles.subtleError}>
                    Care schedule is temporarily unavailable.
                  </Text>
                ) : care.length ? (
                  care.map((item, index) => {
                    const formatted = formatCareDate(item.at);
                    return (
                      <Pressable
                        key={`${item.kind}-${item.id}`}
                        accessibilityRole="button"
                        onPress={() => router.push(item.kind === "reminder"
                          ? { pathname: "/reminder-details", params: { id: item.id } }
                          : { pathname: "/health-reminders", params: { petId: item.petId } })}
                        style={[
                          styles.careRow,
                          index > 0 && styles.careRowBorder,
                        ]}
                      >
                        <View style={styles.careDate}>
                          <Text style={styles.careDateMain}>{formatted.date}</Text>
                          <Text style={styles.careDateSub}>{formatted.time}</Text>
                        </View>
                        <View style={styles.careBody}>
                          <Text numberOfLines={1} style={styles.careTitle}>
                            {item.title}
                          </Text>
                          <Text style={styles.careMeta}>{item.petName}</Text>
                        </View>
                        <CalendarIcon size={18} />
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={styles.emptyCare}>
                    <Text style={styles.emptyCareTitle}>Nothing scheduled soon</Text>
                    <Text style={styles.emptyCareText}>
                      Add reminders from your pet&apos;s care section when you need
                      them.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recovery</Text>
              </View>
              <View style={styles.recoveryCard}>
                <View style={styles.recoveryCopy}>
                  <Text style={styles.recoveryTitle}>Is a pet missing?</Text>
                  <Text style={styles.recoveryText}>
                    Start one recovery report and follow sightings from the
                    Recovery tab.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Report Lost Pet"
                  onPress={reportLost}
                  style={({ pressed }) => [
                    styles.recoveryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <PinIcon size={18} />
                  <Text style={styles.recoveryButtonText}>Report Lost Pet</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.white,
    overflow: "hidden",
  },
  brandMarkImage: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    fontFamily: Fonts.sans,
    fontSize: 18,
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
  date: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: Spacing.four,
  },
  greeting: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: -0.5,
    marginTop: Spacing.one,
  },
  loader: {
    marginTop: Spacing.five,
  },
  sectionHeader: {
    marginTop: Spacing.five,
    marginBottom: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  textAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 36,
    paddingHorizontal: Spacing.one,
  },
  textActionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  welcomeCard: {
    marginTop: Spacing.five,
    padding: Spacing.four,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
  },
  welcomeIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.sage,
  },
  welcomeTitle: {
    fontFamily: Fonts.sans,
    fontSize: 21,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.three,
  },
  welcomeText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  primaryButton: {
    minHeight: 48,
    marginTop: Spacing.four,
    borderRadius: 24,
    backgroundColor: Palette.forestDark,
    paddingHorizontal: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.white,
  },
  petList: {
    gap: Spacing.two,
  },
  petCard: {
    minHeight: 76,
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  petPhoto: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  petPhotoImage: {
    width: "100%",
    height: "100%",
  },
  petBody: {
    flex: 1,
    gap: 3,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  careCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    overflow: "hidden",
  },
  careRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  careRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
  },
  careDate: {
    width: 58,
  },
  careDateMain: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  careDateSub: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  careBody: {
    flex: 1,
  },
  careTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  careMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: 3,
  },
  emptyCare: {
    padding: Spacing.four,
  },
  emptyCareTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  emptyCareText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 19,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  recoveryCard: {
    padding: Spacing.four,
    borderRadius: 18,
    backgroundColor: Palette.goldSoft,
    borderWidth: 1,
    borderColor: "#EBCF86",
    gap: Spacing.three,
  },
  recoveryCopy: {
    gap: Spacing.one,
  },
  recoveryTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  recoveryText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
  },
  recoveryButton: {
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: Palette.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  recoveryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.danger,
  },
  retryText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.two,
  },
  subtleError: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.84,
  },
});
