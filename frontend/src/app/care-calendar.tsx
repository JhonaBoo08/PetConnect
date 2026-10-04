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

import { BackArrow } from "@/components/app-icons";
import { OwnerCareCalendar } from "@/components/owner-care-calendar";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import { listPets } from "@/services/pets";
import type { Pet } from "../../../shared/contracts";

export default function CareCalendarScreen() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      listPets()
        .then((rows) => {
          if (!active) return;
          setPets(rows);
          setError("");
        })
        .catch((cause) => {
          if (active) setError(authErrorMessage(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
            <Text style={styles.screenTitle}>Care calendar</Text>
          </View>

          <Text style={styles.heading}>Plan care by date</Text>
          <Text style={styles.supporting}>
            See reminders and appointments for every pet in one calendar.
          </Text>

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {loading && !pets.length ? (
            <ActivityIndicator color={Palette.forestDark} style={styles.loader} />
          ) : null}

          <OwnerCareCalendar pets={pets} loadingPets={loading} />

          {!loading && pets.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/add-pet")}
              style={styles.addPetButton}
            >
              <Text style={styles.addPetText}>Add your first pet</Text>
            </Pressable>
          ) : null}
        </ScrollView>
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
  topBar: {
    minHeight: 48,
    marginTop: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
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
  screenTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  loader: {
    marginTop: Spacing.four,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.danger,
    marginTop: Spacing.three,
  },
  addPetButton: {
    alignSelf: "center",
    minHeight: 44,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderRadius: 22,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  addPetText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.white,
  },
});
