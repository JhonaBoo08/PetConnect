import {
    CameraView,
    useCameraPermissions,
    type BarcodeScanningResult,
} from "expo-camera";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Easing,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    Vibration,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    BackArrow,
    BellIcon,
    CameraIcon,
    CheckIcon,
    PawIcon,
    QrIcon,
    WarningIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { cacheScannedPet, decodePetQr, getPetById } from "@/lib/pets";
import { useSession } from "@/lib/session";

const PET_ID_PATTERN = /^PC-TAG-\d{4,}$/;
type ScanState =
  "idle" | "confirm" | "searching" | "invalid" | "notfound" | "error";

export default function ScanScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>("idle");
  const processingRef = useRef(false);
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const finderMode = params.mode === "finder";
  const session = useSession();
  const isClinic = session.user?.accountType === "vet" && !finderMode;

  const scanAnim = useState(() => new Animated.Value(0))[0];
  const useNative = Platform.OS !== "web";
  const resetScan = useCallback(() => {
    processingRef.current = false;
    setScanState("idle");
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetScan();
      getPermission();
    }, [getPermission, resetScan]),
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: useNative,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: useNative,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim, useNative]);

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 236],
  });

  const handleScan = useCallback(
    async (data: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      Vibration.vibrate(30);
      setScanState("confirm");
      await new Promise((resolve) => setTimeout(resolve, 700));
      setScanState("searching");

      const value = String(data ?? "").trim();
      const qrPet = decodePetQr(value);
      const petId = qrPet?.id ?? value;
      if (!PET_ID_PATTERN.test(petId)) {
        setScanState("invalid");
        return;
      }
      try {
        const pet = (await getPetById(petId)) ?? qrPet;
        if (!pet) {
          setScanState("notfound");
          return;
        }
        if (qrPet) await cacheScannedPet(qrPet);
        if (isClinic) {
          router.push({
            pathname: "/clinic-scan-result",
            params: { pet: pet.id },
          });
        } else {
          router.push({
            pathname: "/scan-result",
            params: { pet: pet.id, qr: qrPet ? value : undefined, report: "1" },
          });
        }
      } catch {
        setScanState("error");
      }
    },
    [router, isClinic],
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.type !== "qr") return;
      void handleScan(result.data);
    },
    [handleScan],
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
              onPress={() => goBack(isClinic ? "/clinic" : "/dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() =>
                router.push(
                  isClinic ? "/clinic-notifications" : "/notifications",
                )
              }
              style={styles.iconButton}
            >
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>
            {isClinic ? "CLINIC · PET SCAN" : "PET RECOVERY"}
          </Text>
          <Text style={styles.heading}>Scan Pet QR ID</Text>
          <Text style={styles.instruction}>
            Place the Pet-Connect code inside the frame.
          </Text>

          {scanState === "idle" || scanState === "confirm" ? (
            <View style={styles.scanner}>
              {permission?.granted ? (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
              ) : null}
              <View style={styles.frame}>
                <View style={[styles.bracket, styles.bracketTL]} />
                <View style={[styles.bracket, styles.bracketTR]} />
                <View style={[styles.bracket, styles.bracketBL]} />
                <View style={[styles.bracket, styles.bracketBR]} />
                {permission?.granted ? (
                  <Animated.View
                    style={[styles.scanLine, { transform: [{ translateY }] }]}
                  />
                ) : (
                  <CameraIcon />
                )}
              </View>
              {scanState === "confirm" ? (
                <View style={styles.confirmPill}>
                  <CheckIcon size={12} color={Palette.forestDark} />
                  <Text style={styles.confirmPillLabel}>Pet ID found</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.statusCard}>
              {scanState === "searching" ? (
                <>
                  <ActivityIndicator color={Palette.forestDark} size="small" />
                  <Text style={styles.statusTitle}>Finding pet...</Text>
                  <Text style={styles.statusText}>
                    Please wait while we retrieve the recovery profile.
                  </Text>
                </>
              ) : null}

              {scanState === "invalid" ? (
                <View style={styles.statusContent}>
                  <View style={styles.statusIcon}>
                    <QrIcon size={24} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.statusTitle}>QR code not recognized</Text>
                  <Text style={styles.statusText}>
                    This QR code is not linked to a Pet-Connect pet profile.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetScan}
                    style={({ pressed }) => [
                      styles.statusButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.statusButtonLabel}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}

              {scanState === "notfound" ? (
                <View style={styles.statusContent}>
                  <View style={styles.statusIcon}>
                    <PawIcon size={24} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.statusTitle}>
                    Pet profile unavailable
                  </Text>
                  <Text style={styles.statusText}>
                    This Pet-Connect ID could not be found.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetScan}
                    style={({ pressed }) => [
                      styles.statusButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.statusButtonLabel}>Scan again</Text>
                  </Pressable>
                </View>
              ) : null}

              {scanState === "error" ? (
                <View style={styles.statusContent}>
                  <View style={styles.statusIcon}>
                    <WarningIcon size={24} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.statusTitle}>Unable to connect</Text>
                  <Text style={styles.statusText}>
                    We couldn&apos;t retrieve the pet profile. Check your
                    connection and try again.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetScan}
                    style={({ pressed }) => [
                      styles.statusButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.statusButtonLabel}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}

          {permission && !permission.granted ? (
            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>
                {permission.canAskAgain
                  ? "Camera access needed"
                  : "Camera permission denied"}
              </Text>
              <Text style={styles.permissionText}>
                {permission.canAskAgain
                  ? "Allow camera access to scan a Pet-Connect QR ID."
                  : "Enable camera access in your device settings to scan a Pet-Connect ID."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (permission.canAskAgain) {
                    void requestPermission();
                  } else {
                    Linking.openSettings();
                  }
                }}
                style={({ pressed }) => [
                  styles.permissionButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.permissionButtonLabel}>
                  {permission.canAskAgain ? "Allow camera" : "Open Settings"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.helper}>
            Camera access is used only while scanning.
          </Text>
        </ScrollView>

        <BottomNav variant={isClinic ? "clinic" : "owner"} active="scan" />
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
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
  instruction: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  scanner: {
    width: "100%",
    maxWidth: 336,
    height: 325,
    alignSelf: "center",
    marginTop: Spacing.five,
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 6px 14px rgba(27,67,50,0.22)",
    overflow: "hidden",
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    pointerEvents: "none",
  },
  bracket: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: Palette.gold,
  },
  bracketTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  bracketTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  bracketBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  bracketBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  scanLine: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Palette.gold,
    opacity: 0.9,
  },
  confirmPill: {
    position: "absolute",
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    backgroundColor: Palette.gold,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 20,
  },
  confirmPillLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  statusCard: {
    width: "100%",
    maxWidth: 336,
    minHeight: 325,
    alignSelf: "center",
    marginTop: Spacing.five,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    boxShadow: "0px 4px 12px rgba(27,67,50,0.12)",
  },
  statusContent: {
    alignItems: "center",
    gap: Spacing.two,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.one,
  },
  statusTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: "center",
  },
  statusButton: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.three,
  },
  statusButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  permissionCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.four,
    alignItems: "center",
    gap: Spacing.two,
  },
  permissionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  permissionText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    textAlign: "center",
  },
  permissionButton: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.one,
  },
  permissionButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  helper: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
});
