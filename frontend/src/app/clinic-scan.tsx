import { CameraView, useCameraPermissions } from "expo-camera";
import { Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackArrow, QrIcon } from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { recoveryTokenFromQrData } from "@/services/recovery";

export default function ClinicScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState("");

  function handleQr(data: string) {
    if (scanned) return;
    const token = recoveryTokenFromQrData(data);
    if (!token) {
      setError("That QR is not a valid active PetConnect Pet ID format.");
      return;
    }
    setScanned(true);
    setError("");
    router.replace({
      pathname: "/clinic-patient",
      params: { token },
    } as unknown as Href);
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to clinic dashboard"
              onPress={() => goBack("/clinic-dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
            <View style={styles.modePill}>
              <QrIcon size={16} />
              <Text style={styles.modeText}>Clinic patient lookup</Text>
            </View>
          </View>

          <Text style={styles.eyebrow}>CLINIC QR LOOKUP</Text>
          <Text style={styles.heading}>Scan the patient&apos;s Pet ID</Text>
          <Text style={styles.supporting}>
            A clinic account plus the signed PetConnect QR is required. The QR
            resolves only while it remains active.
          </Text>

          <View style={styles.scanner}>
            {!permission ? (
              <ActivityIndicator color={Palette.gold} size="large" />
            ) : !permission.granted ? (
              <View style={styles.permissionCard}>
                <Text style={styles.permissionTitle}>
                  Camera permission needed
                </Text>
                <Text style={styles.permissionText}>
                  PetConnect uses the camera only while this patient scanner is
                  open.
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
                  onMountError={({ message }) => setError(message)}
                />
                <View pointerEvents="none" style={styles.frame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </>
            )}
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setScanned(false);
                  setError("");
                }}
              >
                <Text style={styles.retry}>Keep scanning</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.helper}>
              Public recovery scanning remains separate. This clinic scanner
              opens the authenticated health chart only after both checks
              succeed.
            </Text>
          )}
        </View>
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
    paddingBottom: Spacing.five,
  },
  topBar: {
    marginTop: Spacing.two,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  modePill: {
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.sage,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    gap: Spacing.one,
    alignItems: "center",
  },
  modeText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  eyebrow: {
    marginTop: Spacing.five,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.inkMuted,
  },
  heading: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  supporting: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
  },
  scanner: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: Spacing.five,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "absolute",
    left: "14%",
    top: "14%",
    width: "72%",
    height: "72%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 14,
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: Palette.gold,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
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
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  permissionText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    textAlign: "center",
  },
  permissionButton: {
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: Palette.gold,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
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
    gap: Spacing.two,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.danger,
  },
  retry: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  helper: {
    marginTop: Spacing.four,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
    textAlign: "center",
  },
});
