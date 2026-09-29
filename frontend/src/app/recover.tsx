import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
  PawIcon,
  PinIcon,
  SendIcon,
  ShieldIcon,
} from "@/components/app-icons";
import { RecoveryMap } from "@/components/recovery-map";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import { requestCurrentCoordinates } from "@/services/device-recovery";
import { petPhotoUri } from "@/services/pets";
import { getPublicRecovery } from "@/services/recovery";
import { submitFinderSighting } from "@/services/recovery-network";
import type {
  Coordinates,
  PublicRecoveryProfile,
} from "../../../shared/contracts";

export default function RecoverScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [profile, setProfile] = useState<PublicRecoveryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [finderName, setFinderName] = useState("");
  const [finderContact, setFinderContact] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("This recovery link is missing its PetConnect token.");
      setProfile(null);
      return;
    }
    const result = await getPublicRecovery(token);
    setProfile(result);
    setError("");
  }, [token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((cause) => {
        if (active) {
          setProfile(null);
          setError(authErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function locate() {
    setLocationBusy(true);
    setError("");
    try {
      const next = await requestCurrentCoordinates();
      setLocation(next);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setLocationBusy(false);
    }
  }

  async function submitSighting() {
    if (!token || !profile?.activeReport) return;
    const pin =
      location ||
      (await requestCurrentCoordinates().catch((cause) => {
        setError(authErrorMessage(cause));
        return null;
      }));
    if (!pin) return;

    setSubmitting(true);
    setError("");
    setSubmitted("");
    try {
      await submitFinderSighting(token, {
        finderName,
        finderContact,
        notes,
        latitude: pin.latitude,
        longitude: pin.longitude,
        accuracyM: pin.accuracyM,
      });
      setSubmitted(
        `Thank you. Your GPS sighting of ${profile.pet.name} was sent to the owner.`,
      );
      setNotes("");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  const phone = profile?.owner.phone?.trim() || "";
  const report = profile?.activeReport || null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to scanner"
            onPress={() => goBack("/scan")}
            style={styles.iconButton}
          >
            <BackArrow />
          </Pressable>

          <Text style={styles.category}>PETCONNECT RECOVERY</Text>
          <Text style={styles.heading}>
            {profile ? `You found ${profile.pet.name}` : "Pet recovery profile"}
          </Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={Palette.forestDark}
              style={styles.loading}
            />
          ) : error && !profile ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorTitle}>
                Recovery profile unavailable
              </Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => goBack("/scan")}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Scan another QR</Text>
              </Pressable>
            </View>
          ) : profile ? (
            <>
              <View style={styles.petCard}>
                <View style={styles.photo}>
                  {profile.pet.photoUrl ? (
                    <Image
                      source={{ uri: petPhotoUri(profile.pet.photoUrl)! }}
                      style={styles.photo}
                      contentFit="cover"
                    />
                  ) : (
                    <PawIcon size={72} color={Palette.forestDark} />
                  )}
                </View>
                <View style={styles.petBody}>
                  <View style={styles.petTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.petName}>{profile.pet.name}</Text>
                      <Text style={styles.petMeta}>
                        {[
                          profile.pet.breed || profile.pet.species,
                          profile.pet.sex,
                          profile.pet.ageLabel,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <ShieldIcon size={26} />
                  </View>
                  {profile.pet.identifyingDetails ? (
                    <View style={styles.identifyingBox}>
                      <Text style={styles.darkLabel}>IDENTIFYING DETAILS</Text>
                      <Text style={styles.identifyingText}>
                        {profile.pet.identifyingDetails}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {report ? (
                <View style={styles.alertCard}>
                  <View style={styles.alertTop}>
                    <View>
                      <Text style={styles.label}>ACTIVE RECOVERY CASE</Text>
                      <Text style={styles.alertStatus}>
                        {report.status === "SIGHTED" ? "SIGHTED" : "LOST"}
                      </Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        {report.sightingCount} sighting
                        {report.sightingCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertLocation}>
                    {report.lastSeenText}
                  </Text>
                  {report.details ? (
                    <Text style={styles.muted}>{report.details}</Text>
                  ) : null}
                  <RecoveryMap
                    pins={[
                      {
                        id: "last-known",
                        latitude: report.latitude,
                        longitude: report.longitude,
                        title: `${profile.pet.name} · last known`,
                        description:
                          report.status === "SIGHTED"
                            ? "Latest finder sighting"
                            : "Owner's last-seen pin",
                        status: report.status,
                      },
                    ]}
                    selected={null}
                    height={220}
                  />
                  <Text style={styles.publicNote}>
                    The pin above is the current public recovery location. Your
                    sighting will move it to the GPS point you submit.
                  </Text>
                </View>
              ) : (
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>No active lost report</Text>
                  <Text style={styles.muted}>
                    This Pet ID is valid, but the owner has not currently marked
                    this pet as lost. You can still use the recovery contact
                    below.
                  </Text>
                </View>
              )}

              {report ? (
                <View style={styles.sightingCard}>
                  <Text style={styles.sectionTitle}>Submit a sighting</Text>
                  <Text style={styles.muted}>
                    Send the owner where you saw {profile.pet.name}. Your name
                    and contact are optional and are visible only to the owner.
                  </Text>

                  <Text style={styles.fieldLabel}>Your name (optional)</Text>
                  <TextInput
                    value={finderName}
                    onChangeText={setFinderName}
                    placeholder="Finder name"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />

                  <Text style={styles.fieldLabel}>Contact (optional)</Text>
                  <TextInput
                    value={finderContact}
                    onChangeText={setFinderContact}
                    placeholder="Phone, email, or messaging handle"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />

                  <Text style={styles.fieldLabel}>What did you see?</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Direction, condition, landmark, behavior..."
                    placeholderTextColor={Palette.placeholder}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />

                  <Pressable
                    accessibilityRole="button"
                    disabled={locationBusy}
                    onPress={() => void locate()}
                    style={styles.locationButton}
                  >
                    {locationBusy ? (
                      <ActivityIndicator color={Palette.forestDark} />
                    ) : (
                      <>
                        <PinIcon size={18} />
                        <Text style={styles.locationButtonText}>
                          {location
                            ? "Refresh sighting GPS"
                            : "Use my current GPS"}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {location ? (
                    <>
                      <RecoveryMap
                        pins={[]}
                        selected={{
                          latitude: location.latitude,
                          longitude: location.longitude,
                        }}
                        onSelect={(coordinate) =>
                          setLocation((current) => ({
                            ...coordinate,
                            accuracyM: current?.accuracyM ?? null,
                          }))
                        }
                        height={220}
                      />
                      <Text style={styles.publicNote}>
                        Sighting pin: {location.latitude.toFixed(5)},{" "}
                        {location.longitude.toFixed(5)}
                        {location.accuracyM
                          ? ` · ±${Math.round(location.accuracyM)} m`
                          : ""}
                      </Text>
                    </>
                  ) : null}

                  {error ? (
                    <Text accessibilityRole="alert" style={styles.inlineError}>
                      {error}
                    </Text>
                  ) : null}
                  {submitted ? (
                    <Text style={styles.success}>{submitted}</Text>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => void submitSighting()}
                    style={styles.primaryButton}
                  >
                    {submitting ? (
                      <ActivityIndicator color={Palette.forestDark} />
                    ) : (
                      <>
                        <SendIcon />
                        <Text style={styles.primaryButtonText}>
                          Send GPS sighting
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.contactCard}>
                <Text style={styles.label}>RECOVERY CONTACT</Text>
                <Text style={styles.ownerName}>
                  {profile.owner.displayName}
                </Text>
                {phone ? (
                  <>
                    <Text style={styles.phone}>{phone}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void Linking.openURL("tel:" + phone)}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>
                        Call pet owner
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.muted}>
                    The owner has not added a public recovery phone number yet.
                  </Text>
                )}
              </View>

              <View style={styles.privacyCard}>
                <ShieldIcon size={22} />
                <Text style={styles.privacyText}>
                  This page excludes account email, Firebase identity, health
                  records, appointments, and internal database IDs. Finder
                  contact details are not published to the nearby feed.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => goBack("/scan")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Scan another pet</Text>
              </Pressable>
            </>
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
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
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
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  loading: {
    marginTop: Spacing.five,
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
  },
  photo: {
    width: "100%",
    height: 230,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  petBody: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  petTitleRow: {
    flexDirection: "row",
    gap: Spacing.three,
    alignItems: "flex-start",
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 23,
    fontWeight: "800",
    color: Palette.white,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: "#C9DBC6",
    marginTop: 3,
  },
  identifyingBox: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  darkLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
    color: "#C9DBC6",
  },
  identifyingText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.white,
  },
  alertCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.goldTrack,
    gap: Spacing.two,
  },
  alertTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: Palette.inkMuted,
  },
  alertStatus: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: "900",
    color: Palette.forestDark,
    marginTop: 2,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
  },
  statusPillText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  alertLocation: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  publicNote: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  infoCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.sage,
  },
  infoTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  muted: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  sightingCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  fieldLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  input: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 90,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  locationButton: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  locationButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  contactCard: {
    marginTop: Spacing.four,
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  ownerName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  phone: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  primaryButton: {
    marginTop: Spacing.three,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: Palette.gold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  inlineError: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.danger,
  },
  success: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.forestDark,
    backgroundColor: Palette.sage,
    borderRadius: 10,
    padding: Spacing.two,
  },
  privacyCard: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: "flex-start",
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.four,
  },
  secondaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorCard: {
    marginTop: Spacing.five,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    padding: Spacing.four,
  },
  errorTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
});
