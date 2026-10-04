import { CameraView, useCameraPermissions } from "expo-camera";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackArrow } from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/services/auth-context";
import { recoveryTokenFromQrData } from "@/services/recovery";

export default function ScanScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const owner = state.status === "ready" && state.session.role === "OWNER";
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState("");
  const [cameraError, setCameraError] = useState("");

  function handleQr(data: string) {
    if (scanned) return;
    const token = recoveryTokenFromQrData(data);
    if (!token) {
      setScanError("This QR is not a valid PetConnect recovery code.");
      return;
    }

    setScanned(true);
    setScanError("");
    router.replace(
      { pathname: "/recover", params: { token } } as unknown as Href,
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
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
            Scan Pet QR
          </Text>
          <Text style={styles.instruction}>
            Point your camera at a PetConnect tag or digital Pet ID.
          </Text>

          <View style={styles.scanner}>
            {!permission ? (
              <ActivityIndicator size="large" color={Palette.gold} />
            ) : !permission.granted ? (
              <View style={styles.permissionCard}>
                <Text style={styles.permissionTitle}>Camera access needed</Text>
                <Text style={styles.permissionText}>
                  PetConnect uses your camera only while this scanner is open.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void requestPermission()}
                  style={styles.permissionButton}
                >
                  <Text style={styles.permissionButtonText}>Allow camera</Text>
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
                  onMountError={({ message }) => setCameraError(message)}
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

          {scanError || cameraError ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {cameraError || scanError}
              </Text>
              {scanError ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setScanned(false);
                    setScanError("");
                  }}
                >
                  <Text style={styles.retryText}>Keep scanning</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={styles.helper}>
              Only the pet&apos;s recovery-safe public information opens after a
              successful scan.
            </Text>
          )}
        </View>

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
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
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
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  ownerHeading: {
    marginTop: Spacing.five,
  },
  instruction: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  scanner: {
    width: "100%",
    maxWidth: 390,
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: Spacing.four,
    backgroundColor: Palette.forestDark,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "absolute",
    width: "72%",
    height: "72%",
    top: "14%",
    left: "14%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    borderRadius: 14,
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
    borderRadius: 16,
    backgroundColor: Palette.surface,
    alignItems: "center",
    gap: Spacing.three,
  },
  permissionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  permissionText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: "center",
  },
  permissionButton: {
    minWidth: 150,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButtonText: {
    fontFamily: Fonts.sans,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  helper: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  errorCard: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.danger,
    textAlign: "center",
  },
  retryText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
    fontWeight: "800",
    textAlign: "center",
  },
});
