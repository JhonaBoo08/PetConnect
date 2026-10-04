import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import QRCode from "react-native-qrcode-svg";

import {
  BackArrow,
  BellIcon,
  PawIcon,
  ShareIcon,
  ShieldIcon,
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage, useAuth } from "@/services/auth-context";
import { deletePet, getPet, petPhotoUri } from "@/services/pets";
import {
  getPetRecovery,
  revokePetRecovery,
  rotatePetRecovery,
} from "@/services/recovery";
import type { Pet, RecoveryTokenState } from "../../../shared/contracts";

function RecoveryQr({ value, size = 92 }: { value: string; size?: number }) {
  return (
    <View style={[styles.qrWrap, { width: size + 16, height: size + 16 }]}>
      <QRCode
        value={value}
        size={size}
        color="#000000"
        backgroundColor="#FFFFFF"
        quietZone={size * 0.2}
        ecl="M"
      />
    </View>
  );
}

export default function PetIdScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const session = state.status === "ready" ? state.session : null;
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [pet, setPet] = useState<Pet | null>(null);
  const [recovery, setRecovery] = useState<RecoveryTokenState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!id) {
        setLoading(false);
        setError("Pet ID is missing.");
        return () => {
          active = false;
        };
      }

      setLoading(true);
      Promise.all([getPet(id), getPetRecovery(id)])
        .then(([record, recoveryState]) => {
          if (active) {
            setPet(record);
            setRecovery(recoveryState);
            setError("");
            setRecoveryError("");
          }
        })
        .catch((cause) => {
          if (active) {
            setPet(null);
            setRecovery(null);
            setError(authErrorMessage(cause));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [id, retryKey]),
  );

  async function handleRotateRecovery() {
    if (!pet || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const next = await rotatePetRecovery(pet.id);
      setRecovery(next);
      setSharing(false);
    } catch (cause) {
      setRecoveryError(authErrorMessage(cause));
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleRevokeRecovery() {
    if (!pet || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const next = await revokePetRecovery(pet.id);
      setRecovery(next);
      setSharing(false);
    } catch (cause) {
      setRecoveryError(authErrorMessage(cause));
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleDelete() {
    if (!pet || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePet(pet.id);
      router.replace("/dashboard");
    } catch (cause) {
      setDeleteError(authErrorMessage(cause));
      setDeleting(false);
    }
  }

  if (!pet || loading || error) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
            {loading ? (
              <ActivityIndicator
                color={Palette.forestDark}
                style={{ marginTop: Spacing.five }}
              />
            ) : (
              <>
                <Text accessibilityRole="alert" style={styles.supporting}>
                  {error || "Pet not found."}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetryKey((key) => key + 1)}
                >
                  <Text style={styles.linkLabel}>Retry loading pet</Text>
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const details = [pet.sex, pet.ageLabel].filter(Boolean).join(" · ");
  const recoveryUrl = recovery?.active ? recovery.recoveryUrl : null;

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push("/notifications")}
              style={styles.iconButton}
            >
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>DIGITAL PET ID</Text>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.supporting}>
            This is the owner view. The QR opens a separate recovery-safe public
            profile and can be revoked without changing the pet record.
          </Text>

          <View style={styles.petCard}>
            <View style={styles.photo}>
              {pet.photoUrl ? (
                <Image
                  source={{ uri: petPhotoUri(pet.photoUrl)! }}
                  style={styles.photo}
                  contentFit="cover"
                />
              ) : (
                <>
                  <PawIcon size={64} color={Palette.forestDark} />
                  <Text style={styles.photoCaption}>{pet.name}</Text>
                </>
              )}
            </View>

            <View style={styles.cardBody}>
              <View style={styles.breedRow}>
                <Text style={styles.breed}>{pet.breed || pet.species}</Text>
                <ShieldIcon size={24} />
              </View>
              <Text style={styles.meta}>{details || pet.species}</Text>

              <View style={styles.idPanel}>
                <View style={styles.idText}>
                  <Text style={styles.idLabel}>UNIQUE PET ID</Text>
                  <Text style={styles.idValue}>{pet.id}</Text>
                  <Text style={styles.qrStatus}>
                    {recovery?.active
                      ? "Recovery QR active"
                      : "Recovery QR disabled"}
                  </Text>
                </View>
                {recoveryUrl ? (
                  <RecoveryQr value={recoveryUrl} size={72} />
                ) : (
                  <View style={styles.disabledQr}>
                    <Text style={styles.disabledQrText}>OFF</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryLabel}>PUBLIC RECOVERY CONTACT</Text>
            <Text style={styles.recoveryName}>
              {session?.displayName || "Pet owner"}
            </Text>
            <Text style={styles.recoveryMeta}>
              {session?.phone || "No recovery phone number added"}
            </Text>
            <Text style={styles.recoveryHint}>
              Public recovery does not expose your email, Firebase UID, health
              records, appointments, or this internal pet ID.
            </Text>
          </View>

          {recoveryError ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {recoveryError}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!recoveryUrl || recoveryBusy}
              onPress={() => setSharing(true)}
              style={({ pressed }) => [
                styles.shareButton,
                (!recoveryUrl || recoveryBusy) && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <ShareIcon />
              <Text style={styles.shareLabel}>View QR</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/add-pet", params: { id: pet.id } })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Edit pet</Text>
            </Pressable>
          </View>

          <View style={styles.tokenControls}>
            <Text style={styles.controlTitle}>Recovery QR controls</Text>
            <Text style={styles.controlHelp}>
              Regenerating invalidates every previously printed or saved QR for
              this pet. Disable the QR immediately if a tag is lost or copied.
            </Text>
            <View style={styles.actionRowCompact}>
              <Pressable
                accessibilityRole="button"
                disabled={recoveryBusy}
                onPress={() => void handleRotateRecovery()}
                style={styles.secondaryButton}
              >
                {recoveryBusy ? (
                  <ActivityIndicator color={Palette.forestDark} />
                ) : (
                  <Text style={styles.secondaryLabel}>
                    {recovery?.active ? "Regenerate QR" : "Generate new QR"}
                  </Text>
                )}
              </Pressable>
              {recovery?.active ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={recoveryBusy}
                  onPress={() => void handleRevokeRecovery()}
                  style={styles.secondaryButton}
                >
                  <Text style={[styles.secondaryLabel, styles.dangerText]}>
                    Disable QR
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(true)}
            style={styles.deleteButton}
          >
            <Text style={[styles.secondaryLabel, styles.dangerText]}>
              Delete pet
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {sharing && recoveryUrl ? (
        <View style={styles.overlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>{pet.name}&apos;s Recovery QR</Text>
            <View style={styles.shareCard}>
              <Text style={styles.shareName}>{pet.name}</Text>
              <Text style={styles.shareMeta}>{pet.breed || pet.species}</Text>
              <RecoveryQr value={recoveryUrl} size={170} />
              <Text style={styles.shareInstruction}>
                Scan to open the public recovery profile
              </Text>
            </View>
            <Text style={styles.privacyNote}>
              This QR contains a signed, revocable recovery URL—not the pet
              database ID. Regenerating or disabling the QR invalidates this
              code.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSharing(false)}
              style={styles.shareClose}
            >
              <Text style={styles.shareCloseLabel}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.overlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Delete {pet.name}?</Text>
            <Text style={styles.privacyNote}>
              This permanently removes the pet profile, photo, and recovery QR.
            </Text>
            {deleteError ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {deleteError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => void handleDelete()}
              style={styles.shareClose}
            >
              {deleting ? (
                <ActivityIndicator color={Palette.forestDark} />
              ) : (
                <Text style={[styles.shareCloseLabel, styles.dangerText]}>
                  Delete pet
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => setConfirmingDelete(false)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
  },
  photo: {
    height: 188,
    width: "100%",
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
  },
  photoCaption: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  cardBody: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  breedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breed: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: "800",
    color: Palette.white,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#C9DBC6",
  },
  idPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  idText: {
    flex: 1,
    gap: 4,
  },
  idLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#C9DBC6",
  },
  idValue: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    color: Palette.white,
  },
  qrStatus: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: "#C9DBC6",
  },
  qrWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  disabledQr: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledQrText: {
    fontFamily: Fonts.sans,
    color: "#C9DBC6",
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  recoveryCard: {
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
  },
  recoveryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  recoveryName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: 4,
  },
  recoveryMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  recoveryHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.three,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  actionRowCompact: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  shareLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  tokenControls: {
    marginTop: Spacing.four,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    padding: Spacing.three,
  },
  controlTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  controlHelp: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.four,
  },
  dangerText: {
    color: Palette.danger,
  },
  disabledButton: {
    opacity: 0.45,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(20,40,28,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  shareSheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: "center",
    gap: Spacing.two,
  },
  shareTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  shareCard: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    padding: Spacing.four,
    marginTop: Spacing.two,
  },
  shareName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.white,
  },
  shareMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#C9DBC6",
  },
  shareInstruction: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: "#C9DBC6",
    textAlign: "center",
  },
  privacyNote: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  shareClose: {
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  shareCloseLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  linkLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
    fontWeight: "800",
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
});
