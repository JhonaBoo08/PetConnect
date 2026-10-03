import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
  HealthIcon,
  PawIcon,
  PinIcon,
  PlusIcon,
  QrIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage } from "@/services/auth-context";
import { listPets, petPhotoUri } from "@/services/pets";
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
    requestedAction && ["open", "id", "edit", "health", "lost"].includes(requestedAction)
      ? requestedAction
      : "open";

  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const rows = await listPets();
    setPets(rows);
    setError("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
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
      await load();
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
      router.push({ pathname: "/alerts", params: { mode: "report", petId: pet.id } });
      return;
    }
    router.push({ pathname: "/pet-id", params: { id: pet.id } });
  }

  const actionText =
    action === "id"
      ? "Choose a pet to open its Pet ID."
      : action === "edit"
        ? "Choose the pet you want to edit."
        : action === "health"
          ? "Choose a pet to open its health hub."
          : action === "lost"
            ? "Choose the pet you want to report lost."
            : "Manage every pet linked to your account.";

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
              <BackArrow />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Add another pet" onPress={() => router.push("/add-pet")} style={styles.addButton}>
              <PlusIcon size={16} />
              <Text style={styles.addButtonText}>Add pet</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>MY PETS</Text>
          <Text style={styles.heading}>Your PetConnect family</Text>
          <Text style={styles.supporting}>{actionText}</Text>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {loading ? <ActivityIndicator color={Palette.forestDark} style={styles.loader} /> : null}

          {!loading && pets.length === 0 ? (
            <View style={styles.emptyCard}>
              <PawIcon size={36} color={Palette.forestDark} />
              <Text style={styles.emptyTitle}>No pets linked yet</Text>
              <Text style={styles.emptyText}>Add your first pet to create its digital ID, recovery QR, and care profile.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Add your first pet" onPress={() => router.push("/add-pet")} style={styles.primaryButton}>
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
                  style={({ pressed }) => [styles.petMain, pressed && styles.pressed]}
                >
                  <View style={styles.photo}>
                    {pet.photoUrl ? (
                      <Image source={{ uri: petPhotoUri(pet.photoUrl)! }} style={styles.photoImage} contentFit="cover" />
                    ) : (
                      <PawIcon size={32} color={Palette.forestDark} />
                    )}
                  </View>
                  <View style={styles.petBody}>
                    <Text style={styles.petName}>{pet.name}</Text>
                    <Text style={styles.petMeta}>{[pet.breed || pet.species, pet.sex, pet.ageLabel].filter(Boolean).join(" · ")}</Text>
                    {pet.identifyingDetails ? <Text numberOfLines={2} style={styles.petDetails}>{pet.identifyingDetails}</Text> : null}
                  </View>
                </Pressable>

                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`View ${pet.name} Pet ID`} onPress={() => selectPet(pet, "id")} style={styles.action}>
                    <QrIcon size={17} />
                    <Text style={styles.actionText}>ID</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${pet.name}`} onPress={() => selectPet(pet, "edit")} style={styles.action}>
                    <PawIcon size={17} color={Palette.forestDark} />
                    <Text style={styles.actionText}>Edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${pet.name} health`} onPress={() => selectPet(pet, "health")} style={styles.action}>
                    <HealthIcon size={17} />
                    <Text style={styles.actionText}>Health</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Report ${pet.name} lost`} onPress={() => selectPet(pet, "lost")} style={styles.action}>
                    <PinIcon size={17} />
                    <Text style={styles.actionText}>Lost</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {pets.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="View care for all pets" onPress={() => router.push("/health-reminders")} style={styles.healthAll}>
              <CalendarIcon size={18} />
              <Text style={styles.healthAllText}>View care for all pets</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <BottomNav active="home" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.cream, flexDirection: "row", justifyContent: "center" },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: "100%" },
  content: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: Spacing.two },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: Palette.borderSoft, backgroundColor: Palette.surface, alignItems: "center", justifyContent: "center" },
  addButton: { minHeight: 42, paddingHorizontal: Spacing.three, borderRadius: 21, backgroundColor: Palette.sage, flexDirection: "row", alignItems: "center", gap: Spacing.two },
  addButtonText: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: "800", color: Palette.forestDark },
  eyebrow: { fontFamily: Fonts.sans, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: Palette.forestDark, marginTop: Spacing.five },
  heading: { fontFamily: Fonts.sans, fontSize: 28, fontWeight: "800", color: Palette.forestDark, marginTop: Spacing.one },
  supporting: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20, color: Palette.inkMuted, marginTop: Spacing.two },
  loader: { marginTop: Spacing.five },
  error: { fontFamily: Fonts.sans, color: Palette.danger, marginTop: Spacing.three },
  list: { gap: Spacing.three, marginTop: Spacing.four },
  card: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.borderSoft, borderRadius: 18, overflow: "hidden" },
  petMain: { flexDirection: "row", gap: Spacing.three, padding: Spacing.three, alignItems: "center" },
  photo: { width: 68, height: 68, borderRadius: 16, backgroundColor: Palette.sage, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  petBody: { flex: 1, gap: 3 },
  petName: { fontFamily: Fonts.sans, fontSize: 18, fontWeight: "800", color: Palette.forestDark },
  petMeta: { fontFamily: Fonts.sans, fontSize: 12.5, color: Palette.inkMuted },
  petDetails: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, color: Palette.inkMuted },
  actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Palette.borderSoft },
  action: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 },
  actionText: { fontFamily: Fonts.sans, fontSize: 11, fontWeight: "700", color: Palette.forestDark },
  emptyCard: { marginTop: Spacing.four, padding: Spacing.five, borderRadius: 18, borderWidth: 1, borderColor: Palette.borderSoft, backgroundColor: Palette.surface, alignItems: "center", gap: Spacing.two },
  emptyTitle: { fontFamily: Fonts.sans, fontSize: 18, fontWeight: "800", color: Palette.forestDark },
  emptyText: { fontFamily: Fonts.sans, fontSize: 13.5, lineHeight: 20, color: Palette.inkMuted, textAlign: "center" },
  primaryButton: { marginTop: Spacing.two, minHeight: 46, paddingHorizontal: Spacing.four, borderRadius: 23, backgroundColor: Palette.forestDark, flexDirection: "row", alignItems: "center", gap: Spacing.two },
  primaryButtonText: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: "800", color: Palette.white },
  healthAll: { marginTop: Spacing.four, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: Palette.borderSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two },
  healthAllText: { fontFamily: Fonts.sans, fontSize: 13.5, fontWeight: "700", color: Palette.forestDark },
  pressed: { opacity: 0.82 },
});
