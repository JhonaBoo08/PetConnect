import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  CalendarIcon,
  ChevronRightIcon,
  HealthIcon,
  PawIcon,
  PinIcon,
  PlusIcon,
  QrIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { ListSkeleton } from "@/components/loading-skeleton";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage } from "@/services/auth-context";
import {
  listPets,
  peekPets,
  peekPetsCached,
  petPhotoUri,
} from "@/services/pets";
import type { Pet } from "../../../shared/contracts";

type PetAction = "open" | "id" | "edit" | "health" | "lost";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function MyPetsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const requestedAction = firstParam(params.action) as PetAction | undefined;
  const action: PetAction =
    requestedAction &&
    ["open", "id", "edit", "health", "lost"].includes(requestedAction)
      ? requestedAction
      : "open";
  const selectionMode = action !== "open";

  const [pets, setPets] = useState<Pet[]>(peekPets);
  const [loading, setLoading] = useState(() => peekPetsCached() === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    const rows = await listPets({ force });
    setPets(rows);
    setError("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .catch((cause) => {
          if (active) setError(authErrorMessage(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await load(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  function selectPet(pet: Pet, nextAction: PetAction = action) {
    if (nextAction === "edit") {
      router.push({ pathname: "/add-pet", params: { id: pet.id } });
      return;
    }
    if (nextAction === "health") {
      router.push({ pathname: "/health-reminders", params: { petId: pet.id } });
      return;
    }
    if (nextAction === "lost") {
      router.push({
        pathname: "/alerts",
        params: { mode: "report", petId: pet.id },
      });
      return;
    }
    router.push({ pathname: "/pet-id", params: { id: pet.id } });
  }

  const selectionText =
    action === "id"
      ? "Choose a pet to open its Pet ID."
      : action === "edit"
        ? "Choose the pet you want to edit."
        : action === "health"
          ? "Choose a pet to open its care and health records."
          : action === "lost"
            ? "Choose the missing pet to start a recovery report."
            : "";

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <View style={styles.topBar}>
            {selectionMode ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={styles.iconButton}
              >
                <BackArrow />
              </Pressable>
            ) : (
              <Text style={styles.screenTitle}>Pets</Text>
            )}

            {!loading && pets.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add pet"
                onPress={() => router.push("/add-pet")}
                style={styles.addButton}
              >
                <PlusIcon size={16} />
                <Text style={styles.addButtonText}>Add pet</Text>
              </Pressable>
            ) : null}
          </View>

          {selectionMode ? (
            <View style={styles.selectionHeader}>
              <Text style={styles.heading}>Choose a pet</Text>
              <Text style={styles.supporting}>{selectionText}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.supporting}>
                Your pets, Pet IDs, and care.
              </Text>
            </>
          )}

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {loading ? (
            <View style={styles.loader}>
              <ListSkeleton rows={3} />
            </View>
          ) : null}

          {!loading && pets.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <PawIcon size={30} />
              </View>
              <Text style={styles.emptyTitle}>No pets yet</Text>
              <Text style={styles.emptyText}>
                Add your first pet to create a digital Pet ID, care profile, and
                recovery identity.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add your first pet"
                onPress={() => router.push("/add-pet")}
                style={styles.primaryButton}
              >
                <PlusIcon size={17} color={Palette.white} />
                <Text style={styles.primaryButtonText}>Add your first pet</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.list}>
            {pets.map((pet) => (
              <View key={pet.id} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${pet.name}`}
                  onPress={() => selectPet(pet)}
                  style={({ pressed }) => [
                    styles.petMain,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.photo}>
                    {pet.photoUrl ? (
                      <Image
                        source={{ uri: petPhotoUri(pet.photoUrl)! }}
                        style={styles.photoImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={pet.photoUrl || pet.id}
                        transition={120}
                      />
                    ) : (
                      <PawIcon size={30} />
                    )}
                  </View>
                  <View style={styles.petBody}>
                    <Text style={styles.petName}>{pet.name}</Text>
                    <Text style={styles.petMeta}>
                      {[pet.breed || pet.species, pet.sex, pet.ageLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <Text style={styles.protectedText}>Pet ID active</Text>
                  </View>
                  <ChevronRightIcon />
                </Pressable>

                {!selectionMode ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View ${pet.name} Pet ID`}
                      onPress={() => selectPet(pet, "id")}
                      style={styles.action}
                    >
                      <QrIcon size={17} />
                      <Text style={styles.actionText}>Pet ID</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${pet.name} care and health`}
                      onPress={() => selectPet(pet, "health")}
                      style={styles.action}
                    >
                      <HealthIcon size={17} />
                      <Text style={styles.actionText}>Care</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${pet.name}`}
                      onPress={() => selectPet(pet, "edit")}
                      style={styles.action}
                    >
                      <PawIcon size={16} />
                      <Text style={styles.actionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${pet.name} lost`}
                      onPress={() => selectPet(pet, "lost")}
                      style={styles.action}
                    >
                      <PinIcon size={17} />
                      <Text style={[styles.actionText, styles.lostText]}>
                        Lost
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {!selectionMode && pets.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open care calendar"
              onPress={() => router.push("/care-calendar")}
              style={styles.careButton}
            >
              <CalendarIcon size={18} />
              <Text style={styles.careButtonText}>Care calendar</Text>
              <ChevronRightIcon size={18} />
            </Pressable>
          ) : null}
        </ScrollView>

        {!selectionMode ? <BottomNav active="pets" /> : null}
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
    maxWidth: MaxContentWidth,
    width: "100%",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  topBar: {
    minHeight: 46,
    marginTop: Spacing.two,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  screenTitle: {
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
  addButton: {
    minHeight: 42,
    paddingHorizontal: Spacing.three,
    borderRadius: 21,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  addButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  selectionHeader: {
    marginTop: Spacing.four,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    fontFamily: Fonts.sans,
    color: Palette.danger,
    marginTop: Spacing.three,
  },
  list: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  card: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 18,
    overflow: "hidden",
  },
  petMain: {
    flexDirection: "row",
    gap: Spacing.three,
    padding: Spacing.three,
    alignItems: "center",
  },
  photo: {
    width: 66,
    height: 66,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  petBody: {
    flex: 1,
    gap: 3,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  protectedText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: 3,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
  },
  action: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  actionText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  lostText: {
    color: Palette.danger,
  },
  emptyCard: {
    marginTop: Spacing.four,
    padding: Spacing.five,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.three,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  primaryButton: {
    marginTop: Spacing.four,
    minHeight: 46,
    paddingHorizontal: Spacing.four,
    borderRadius: 23,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.white,
  },
  careButton: {
    marginTop: Spacing.four,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  careButtonText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.82,
  },
});
