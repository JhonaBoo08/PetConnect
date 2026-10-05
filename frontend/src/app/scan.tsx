import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
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

import { BackArrow, PinIcon } from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { getApiBaseUrl } from "@/services/auth";
import { authErrorMessage, useAuth } from "@/services/auth-context";
import { requestCurrentCoordinates } from "@/services/device-recovery";
import { getNearbyLostReports } from "@/services/recovery-network";
import {
  recoveryTokenFromQrData,
  resolveRecoveryCode,
} from "@/services/recovery";
import type { NearbyLostReport } from "../../../shared/contracts";

export default function ScanScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const owner = state.status === "ready" && state.session.role === "OWNER";
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearby, setNearby] = useState<NearbyLostReport[]>([]);
  const [matchSpecies, setMatchSpecies] = useState("");
  const [matchBreed, setMatchBreed] = useState("");
  const [matchAppearance, setMatchAppearance] = useState("");

  function openToken(token: string, source: "QR" | "CODE") {
    router.replace({
      pathname: "/recover",
      params: { token, source },
    } as unknown as Href);
  }

  function handleQr(data: string) {
    if (scanned) return;
    const token = recoveryTokenFromQrData(data);
    if (!token) {
      setError("Not a PetConnect tag.");
      return;
    }
    setScanned(true);
    setError("");
    openToken(token, "QR");
  }

  async function useCode() {
    const value = code.trim();
    if (!value || codeBusy) return;
    setCodeBusy(true);
    setError("");
    try {
      const resolved = await resolveRecoveryCode(value);
      openToken(resolved.token, "CODE");
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setCodeBusy(false);
    }
  }

  async function findNearby() {
    if (nearbyBusy) return;
    setNearbyOpen(true);
    setNearbyBusy(true);
    setError("");
    try {
      const location = await requestCurrentCoordinates({ preferFast: true });
      setNearby(
        await getNearbyLostReports(location.latitude, location.longitude, 10, {
          species: matchSpecies,
          breed: matchBreed,
          appearance: matchAppearance,
        }),
      );
    } catch (cause) {
      setNearby([]);
      setError(authErrorMessage(cause));
    } finally {
      setNearbyBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {!owner ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/")}
              style={styles.backButton}
            >
              <BackArrow />
            </Pressable>
          ) : null}

          <Text style={[styles.heading, owner && styles.ownerHeading]}>
            Find a pet
          </Text>

          <View style={styles.scanner}>
            {!permission ? (
              <ActivityIndicator size="large" color={Palette.gold} />
            ) : !permission.granted ? (
              <View style={styles.permissionCard}>
                <Text style={styles.permissionTitle}>Camera access needed</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void requestPermission()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Allow camera</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={
                    scanned ? undefined : ({ data }) => handleQr(data)
                  }
                  onMountError={({ message }) => setError(message)}
                />
                <View pointerEvents="none" style={styles.frame}>
                  <View style={[styles.bracket, styles.bracketTL]} />
                  <View style={[styles.bracket, styles.bracketTR]} />
                  <View style={[styles.bracket, styles.bracketBL]} />
                  <View style={[styles.bracket, styles.bracketBR]} />
                </View>
              </>
            )}
          </View>

          <Text style={styles.scanLabel}>Scan the PetConnect tag</Text>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.or}>OR</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.codeRow}>
            <TextInput
              accessibilityLabel="PetConnect code"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void useCode()}
              placeholder="PC-12AB34CD"
              placeholderTextColor={Palette.placeholder}
              style={styles.codeInput}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!code.trim() || codeBusy}
              onPress={() => void useCode()}
              style={[
                styles.codeButton,
                (!code.trim() || codeBusy) && styles.disabled,
              ]}
            >
              {codeBusy ? (
                <ActivityIndicator color={Palette.white} />
              ) : (
                <Text style={styles.codeButtonText}>Open</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setNearbyOpen((value) => !value)}
            style={styles.noTagButton}
          >
            <PinIcon size={18} />
            <Text style={styles.noTagText}>
              {nearbyOpen ? "Close no-tag search" : "Can't scan a tag?"}
            </Text>
          </Pressable>

          {error ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          ) : null}

          {nearbyOpen ? (
            <View style={styles.nearbySection}>
              <Text style={styles.sectionTitle}>Find a match nearby</Text>
              <View style={styles.speciesRow}>
                {["Dog", "Cat", "Bird", "Other"].map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: matchSpecies === option }}
                    onPress={() =>
                      setMatchSpecies((current) =>
                        current === option ? "" : option,
                      )
                    }
                    style={[
                      styles.speciesChip,
                      matchSpecies === option && styles.speciesChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.speciesChipText,
                        matchSpecies === option && styles.speciesChipTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Possible breed"
                value={matchBreed}
                onChangeText={setMatchBreed}
                placeholder="Breed (optional)"
                placeholderTextColor={Palette.placeholder}
                style={styles.matchInput}
              />
              <TextInput
                accessibilityLabel="Pet appearance"
                value={matchAppearance}
                onChangeText={setMatchAppearance}
                placeholder="Color, markings, collar..."
                placeholderTextColor={Palette.placeholder}
                style={styles.matchInput}
              />
              <Pressable
                accessibilityRole="button"
                disabled={nearbyBusy}
                onPress={() => void findNearby()}
                style={styles.matchButton}
              >
                {nearbyBusy ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text style={styles.matchButtonText}>Find nearby pets</Text>
                )}
              </Pressable>

              {!nearbyBusy && nearby.length
                ? nearby.map((report) => (
                    <Pressable
                      key={report.id}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: "/recover",
                          params: { reportId: report.id },
                        } as unknown as Href)
                      }
                      style={({ pressed }) => [
                        styles.petRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.petThumb}>
                        {report.petPhotoUrl ? (
                          <Image
                            source={{
                              uri: `${getApiBaseUrl()}${report.petPhotoUrl}`,
                            }}
                            style={styles.petThumbImage}
                            contentFit="cover"
                          />
                        ) : (
                          <PinIcon size={19} />
                        )}
                      </View>
                      <View style={styles.petRowCopy}>
                        <Text style={styles.petName}>{report.petName}</Text>
                        <Text style={styles.petMeta}>
                          {[
                            report.petBreed || report.petSpecies,
                            `${report.distanceKm.toFixed(1)} km away`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {report.matchReasons.length ? (
                          <View style={styles.matchReasonRow}>
                            {report.matchReasons.map((reason) => (
                              <View key={reason} style={styles.matchReasonChip}>
                                <Text style={styles.matchReasonText}>
                                  {reason}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.reportText}>Report sighting</Text>
                    </Pressable>
                  ))
                : null}
              {!nearbyBusy && nearbyOpen && nearby.length === 0 ? (
                <Text style={styles.emptyText}>
                  Search to compare nearby active reports.
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {owner ? <BottomNav active="scan" /> : null}
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
  backButton: {
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
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  ownerHeading: { marginTop: Spacing.two },
  scanner: {
    width: "100%",
    maxWidth: 390,
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: Spacing.four,
    backgroundColor: Palette.forestDark,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "absolute",
    width: "70%",
    height: "70%",
    top: "15%",
    left: "15%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 16,
  },
  bracket: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: Palette.gold,
  },
  bracketTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  bracketTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bracketBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bracketBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  permissionCard: {
    margin: Spacing.four,
    padding: Spacing.four,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    alignItems: "center",
    gap: Spacing.three,
  },
  permissionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: Spacing.four,
    borderRadius: 14,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontWeight: "800",
    color: Palette.white,
  },
  scanLabel: {
    marginTop: Spacing.three,
    textAlign: "center",
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  dividerRow: {
    marginVertical: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  divider: { flex: 1, height: 1, backgroundColor: Palette.borderSoft },
  or: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    color: Palette.inkMuted,
  },
  codeRow: { flexDirection: "row", gap: Spacing.two },
  codeInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    color: Palette.forestDark,
  },
  codeButton: {
    minWidth: 82,
    borderRadius: 14,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  codeButtonText: {
    fontFamily: Fonts.sans,
    fontWeight: "800",
    color: Palette.white,
  },
  disabled: { opacity: 0.45 },
  noTagButton: {
    marginTop: Spacing.three,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  noTagText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorText: {
    marginTop: Spacing.three,
    padding: Spacing.two,
    borderRadius: 10,
    backgroundColor: Palette.dangerSoft,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.danger,
  },
  nearbySection: { marginTop: Spacing.four, gap: Spacing.two },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  speciesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  speciesChip: {
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
  },
  speciesChipActive: {
    backgroundColor: Palette.forestDark,
    borderColor: Palette.forestDark,
  },
  speciesChipText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  speciesChipTextActive: { color: Palette.white },
  matchInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.forestDark,
  },
  matchButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  matchButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.white,
  },
  petRow: {
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  petThumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  petThumbImage: {
    width: "100%",
    height: "100%",
  },
  petRowCopy: { flex: 1 },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  petMeta: {
    marginTop: 3,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  matchReasonRow: {
    marginTop: Spacing.one,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  matchReasonChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Palette.sage,
  },
  matchReasonText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  reportText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  pressed: { opacity: 0.72 },
});
