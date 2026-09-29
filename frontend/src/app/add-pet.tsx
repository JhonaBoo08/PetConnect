import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PawIcon,
  ShieldIcon,
  UploadIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  createPet,
  getPet,
  petPhotoUri,
  removePetPhoto,
  updatePet,
  uploadPetPhoto,
} from "@/services/pets";

const speciesOptions = ["Dog", "Cat", "Bird", "Other"];
const sexOptions: Array<"Male" | "Female"> = ["Male", "Female"];

export default function AddPetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [savedId, setSavedId] = useState(routeId);
  const [photo, setPhoto] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [name, setName] = useState("");
  const [speciesOpen, setSpeciesOpen] = useState(false);
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<"" | "Male" | "Female">("");
  const [age, setAge] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ name?: string; species?: string }>({});
  const [loading, setLoading] = useState(!!routeId);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!routeId) return;
    let active = true;
    setLoading(true);
    getPet(routeId)
      .then((pet) => {
        if (!active) return;
        setSavedId(pet.id);
        setName(pet.name);
        setSpecies(pet.species);
        setBreed(pet.breed);
        setSex(pet.sex);
        setAge(pet.ageLabel);
        setNotes(pet.identifyingDetails);
        setExistingPhoto(pet.photoUrl);
        setLoadError("");
      })
      .catch((error) => {
        if (active) setLoadError(authErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [routeId, retryKey]);

  async function pickPhoto() {
    setSaveError("");
    setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
      const longest = Math.max(asset.width, asset.height);
      if (longest > 1200)
        context.resize({
          width: Math.round((asset.width * 1200) / longest),
          height: Math.round((asset.height * 1200) / longest),
        });
      const rendered = await context.renderAsync();
      const jpeg = await rendered.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.78,
      });
      setPhoto(jpeg.uri);
      setRemoveExisting(false);
    } catch (error) {
      setSaveError(authErrorMessage(error));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (saving || loading) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Please enter your pet’s name.";
    if (!species) next.species = "Please select a species.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError("");
    let petSaved = false;
    try {
      const input = {
        name,
        species,
        breed,
        sex,
        ageLabel: age,
        identifyingDetails: notes,
      };
      const pet = savedId
        ? await updatePet(savedId, input)
        : await createPet(input);
      petSaved = true;
      setSavedId(pet.id);
      if (photo) await uploadPetPhoto(pet.id, photo);
      else if (removeExisting) await removePetPhoto(pet.id);
      router.replace({ pathname: "/pet-id", params: { id: pet.id } });
    } catch (error) {
      setSaveError(
        petSaved
          ? `Pet details saved, but the photo could not be updated. ${authErrorMessage(error)}`
          : authErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => goBack("/dashboard")}
                style={styles.iconButton}
              >
                <BackArrow />
              </Pressable>

              <View style={styles.brandRow}>
                <View style={styles.brandMark}>
                  <Image
                    source={require("@/assets/images/logo.png")}
                    style={styles.brandMarkImage}
                    contentFit="contain"
                  />
                </View>
                <View>
                  <Text style={styles.brandName}>Pet-Connect</Text>
                  <Text style={styles.brandTagline}>
                    SCAN · PROTECT · RECONNECT
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.iconButton}
            >
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>PET PROFILE</Text>
          <Text style={styles.heading}>
            {routeId ? "Edit pet" : "Add a pet"}
          </Text>
          <Text style={styles.supporting}>
            Keep your pet&apos;s details current so it can be identified if
            lost.
          </Text>

          {loading ? (
            <ActivityIndicator
              color={Palette.forestDark}
              style={{ marginTop: Spacing.four }}
            />
          ) : null}
          {loadError ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>
                {loadError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRetryKey((key) => key + 1)}
              >
                <Text style={styles.photoRemove}>Retry loading pet</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.photoPreview}>
            <View style={styles.photoThumb}>
              {photo || (existingPhoto && !removeExisting) ? (
                <Image
                  source={{ uri: photo || petPhotoUri(existingPhoto)! }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              ) : (
                <PawIcon size={34} color={Palette.forestDark} />
              )}
            </View>
            <View style={styles.photoInfo}>
              <Text style={styles.photoTitle}>
                {photo
                  ? "Selected pet photo"
                  : existingPhoto && !removeExisting
                    ? "Current pet photo"
                    : "No photo yet"}
              </Text>
              <Text style={styles.photoHint}>
                A clear photo helps people recognize your pet.
              </Text>
            </View>
            {photo || (existingPhoto && !removeExisting) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPhoto(null);
                  setRemoveExisting(true);
                }}
              >
                <Text style={styles.photoRemove}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void pickPhoto()}
            disabled={photoBusy || loading || !!loadError}
            style={({ pressed }) => [
              styles.photoButton,
              pressed && styles.pressed,
            ]}
          >
            <UploadIcon />
            <Text style={styles.photoLabel}>
              {photoBusy
                ? "Preparing photo..."
                : photo || (existingPhoto && !removeExisting)
                  ? "Replace photo"
                  : "Add pet photo"}
            </Text>
          </Pressable>

          <Text style={styles.label}>Pet name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim())
                setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Bantay"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

          <Text style={styles.label}>Species</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSpeciesOpen((open) => !open)}
            style={[styles.input, styles.fieldRow]}
          >
            <Text style={styles.inputText}>{species || "Select species"}</Text>
            <ChevronDownIcon />
          </Pressable>
          {speciesOpen ? (
            <View style={styles.dropdown}>
              {speciesOptions.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => {
                    setSpecies(option);
                    setSpeciesOpen(false);
                    setErrors((prev) => ({ ...prev, species: undefined }));
                  }}
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.dropdownLabel}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {errors.species ? (
            <Text style={styles.error}>{errors.species}</Text>
          ) : null}

          <Text style={styles.label}>Breed</Text>
          <TextInput
            value={breed}
            onChangeText={setBreed}
            placeholder="e.g. Golden Retriever"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Sex</Text>
          <View style={styles.segment}>
            {sexOptions.map((option) => {
              const isActive = sex === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setSex(option)}
                  style={[
                    styles.segmentItem,
                    isActive && styles.segmentItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      isActive && styles.segmentLabelActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Age</Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="e.g. 3 years"
            placeholderTextColor={Palette.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Identifying details</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Collar, markings, temperament..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <View style={styles.idPanel}>
            <ShieldIcon size={22} />
            <View style={styles.idText}>
              <Text style={styles.idLabel}>UNIQUE PET ID</Text>
              <Text style={styles.idValue}>
                {savedId || "Assigned when saved"}
              </Text>
            </View>
            <CheckIcon size={16} color={Palette.forestDark} />
          </View>
          <Text style={styles.idHint}>
            The API assigns this unique Pet-Connect ID when your pet is saved.
          </Text>

          {saveError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {saveError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving || loading || !!loadError || photoBusy}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={Palette.forestDark} />
            ) : (
              <Text style={styles.saveLabel}>
                {routeId ? "Save changes" : "Save pet"}
              </Text>
            )}
          </Pressable>
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
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 32,
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "center",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandMarkImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  brandName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "600",
    color: Palette.inkMuted,
    letterSpacing: 1.2,
    marginTop: 2,
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
  bellDot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.gold,
    borderWidth: 1.5,
    borderColor: Palette.surface,
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  photoPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    padding: Spacing.two,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  photoInfo: {
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  photoHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  photoRemove: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.danger,
    paddingHorizontal: Spacing.two,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    marginTop: Spacing.three,
  },
  photoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  input: {
    minHeight: 44,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 96,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: "top",
  },
  dropdown: {
    marginTop: Spacing.two,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  dropdownLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: Palette.white,
  },
  idPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.goldTrack,
    borderRadius: 12,
    padding: Spacing.three,
  },
  idText: {
    flex: 1,
    gap: 2,
  },
  idLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  idValue: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: 0.5,
  },
  idHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    shadowColor: "#F2B632",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  saveLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
