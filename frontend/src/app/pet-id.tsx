import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import { authErrorMessage } from "@/services/auth-context";
import { deletePet, getPet, petPhotoUri } from "@/services/pets";
import {
  createRecoveryTag,
  listRecoveryTags,
  markRecoveryTagLost,
  replaceRecoveryTag,
  revokeRecoveryTag,
} from "@/services/recovery";
import type { Pet, RecoveryTag } from "../../../shared/contracts";

type QrHandle = {
  toDataURL: (callback: (data: string) => void) => void;
};

function RecoveryQr({
  value,
  size = 92,
  getRef,
}: {
  value: string;
  size?: number;
  getRef?: (ref: QrHandle | null) => void;
}) {
  return (
    <View style={[styles.qrWrap, { width: size + 20, height: size + 20 }]}>
      <QRCode
        value={value}
        size={size}
        color="#000000"
        backgroundColor="#FFFFFF"
        quietZone={size * 0.22}
        ecl="H"
        getRef={getRef}
      />
    </View>
  );
}

function tagStatus(tag: RecoveryTag) {
  if (tag.status === "ACTIVE") return "Active";
  if (tag.status === "LOST") return "Lost";
  return "Disabled";
}

function scanLabel(tag: RecoveryTag) {
  if (!tag.lastScannedAt) return "Never scanned";
  return `Scanned ${new Date(tag.lastScannedAt).toLocaleDateString()}`;
}

export default function PetIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const qrRef = useRef<QrHandle | null>(null);

  const [pet, setPet] = useState<Pet | null>(null);
  const [tags, setTags] = useState<RecoveryTag[]>([]);
  const [selectedTag, setSelectedTag] = useState<RecoveryTag | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTagId, setBusyTagId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) throw new Error("Pet ID is missing.");
    const [record, recoveryTags] = await Promise.all([
      getPet(id),
      listRecoveryTags(id),
    ]);
    setPet(record);
    setTags(recoveryTags);
    setError("");
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load()
        .catch((cause) => {
          if (active) {
            setPet(null);
            setTags([]);
            setError(authErrorMessage(cause));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [load, retryKey]),
  );

  async function createTag() {
    if (!pet || creating) return;
    setCreating(true);
    setError("");
    try {
      const next = await createRecoveryTag(pet.id, {
        label: tags.length ? `Spare tag ${tags.length + 1}` : "Main tag",
        tagType: "PRINT",
      });
      setTags((current) => [...current, next]);
      setSelectedTag(next);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  async function updateTag(
    tag: RecoveryTag,
    action: "replace" | "lost" | "revoke",
  ) {
    if (!pet || busyTagId) return;
    setBusyTagId(tag.id);
    setError("");
    try {
      const next =
        action === "replace"
          ? await replaceRecoveryTag(pet.id, tag.id)
          : action === "lost"
            ? await markRecoveryTagLost(pet.id, tag.id)
            : await revokeRecoveryTag(pet.id, tag.id);
      setTags((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      if (selectedTag?.id === next.id) {
        setSelectedTag(next.status === "ACTIVE" ? next : null);
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusyTagId("");
    }
  }

  async function handleDelete() {
    if (!pet || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deletePet(pet.id);
      router.replace("/dashboard");
    } catch (cause) {
      setError(authErrorMessage(cause));
      setDeleting(false);
    }
  }

  async function composedTagDataUrl(qrData: string): Promise<string> {
    if (Platform.OS !== "web" || !pet || !selectedTag) return "";
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare printable tag.");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = Palette.forestDark;
    ctx.textAlign = "center";
    ctx.font = "700 64px Arial";
    ctx.fillText(pet.name.toUpperCase(), 450, 100);
    ctx.font = "800 38px Arial";
    ctx.fillText("I'M LOST", 450, 160);
    const image = document.createElement("img");
    image.src = `data:image/png;base64,${qrData}`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not prepare QR image."));
    });
    ctx.drawImage(image, 140, 220, 620, 620);
    ctx.fillStyle = Palette.forestDark;
    ctx.font = "700 29px Arial";
    ctx.fillText("SCAN TO HELP ME GET HOME", 450, 900);
    ctx.font = "800 35px monospace";
    ctx.fillText(selectedTag.shortCode, 450, 960);
    ctx.font = "600 24px Arial";
    ctx.fillText("PetConnect", 450, 1025);
    return canvas.toDataURL("image/png");
  }

  async function exportTag(mode: "download" | "print" | "share") {
    if (!pet || !selectedTag?.recoveryUrl) return;
    if (Platform.OS !== "web") {
      await Share.share({
        title: `${pet.name}'s PetConnect tag`,
        message: `${pet.name} · ${selectedTag.shortCode}\n${selectedTag.recoveryUrl}`,
      });
      return;
    }
    qrRef.current?.toDataURL((qrData) => {
      void composedTagDataUrl(qrData)
        .then((tagImage) => {
          if (mode === "download") {
            const anchor = document.createElement("a");
            anchor.href = tagImage;
            anchor.download = `petconnect-${pet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-tag.png`;
            anchor.click();
            return;
          }
          if (mode === "print") {
            const popup = window.open("", "_blank", "width=700,height=900");
            if (!popup) return;
            popup.document.write(
              `<!doctype html><html><head><title>${pet.name} PetConnect Tag</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh}img{max-width:95vw;max-height:95vh}</style></head><body><img src="${tagImage}" onload="window.print()"></body></html>`,
            );
            popup.document.close();
          }
        })
        .catch((cause) => setError(authErrorMessage(cause)));
    });
  }

  if (!pet || loading) {
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
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {error || "Pet not found."}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetryKey((key) => key + 1)}
                >
                  <Text style={styles.linkLabel}>Retry</Text>
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const activeTags = tags.filter((tag) => tag.status === "ACTIVE");
  const details = [pet.breed || pet.species, pet.sex, pet.ageLabel]
    .filter(Boolean)
    .join(" · ");

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
            </Pressable>
          </View>

          <Text style={styles.category}>PET ID</Text>
          <Text style={styles.petName}>{pet.name}</Text>

          <View style={styles.petCard}>
            <View style={styles.photo}>
              {pet.photoUrl ? (
                <Image
                  source={{ uri: petPhotoUri(pet.photoUrl)! }}
                  style={styles.photo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <PawIcon size={62} color={Palette.forestDark} />
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.breed}>{details || pet.species}</Text>
              <View style={styles.statusRow}>
                <ShieldIcon size={19} color={Palette.white} />
                <Text style={styles.statusText}>
                  {activeTags.length} active{" "}
                  {activeTags.length === 1 ? "tag" : "tags"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recovery tags</Text>
            <Pressable
              accessibilityRole="button"
              disabled={creating}
              onPress={() => void createTag()}
              style={styles.addButton}
            >
              {creating ? (
                <ActivityIndicator color={Palette.forestDark} />
              ) : (
                <Text style={styles.addButtonText}>+ New tag</Text>
              )}
            </Pressable>
          </View>

          {tags.map((tag) => {
            const active = tag.status === "ACTIVE";
            const busy = busyTagId === tag.id;
            return (
              <View key={tag.id} style={styles.tagCard}>
                <View style={styles.tagTop}>
                  <View style={styles.tagCopy}>
                    <Text style={styles.tagName}>{tag.label}</Text>
                    <Text style={styles.tagCode}>{tag.shortCode}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      !active && styles.statusPillInactive,
                    ]}
                  >
                    <Text style={styles.statusPillText}>{tagStatus(tag)}</Text>
                  </View>
                </View>
                <Text style={styles.scanMeta}>
                  {scanLabel(tag)}
                  {tag.scanCount
                    ? ` · ${tag.scanCount} scan${tag.scanCount === 1 ? "" : "s"}`
                    : ""}
                </Text>

                {busy ? (
                  <ActivityIndicator
                    color={Palette.forestDark}
                    style={styles.tagBusy}
                  />
                ) : (
                  <View style={styles.tagActions}>
                    {active ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setSelectedTag(tag)}
                        style={styles.primarySmall}
                      >
                        <Text style={styles.primarySmallText}>View</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void updateTag(tag, "replace")}
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>Replace</Text>
                    </Pressable>
                    {active ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void updateTag(tag, "lost")}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallButtonText}>Lost</Text>
                      </Pressable>
                    ) : null}
                    {tag.status !== "REVOKED" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void updateTag(tag, "revoke")}
                        style={styles.smallButton}
                      >
                        <Text style={styles.dangerText}>Disable</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}

          {error ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/add-pet", params: { id: pet.id } })
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Edit pet</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmingDelete(true)}
              style={styles.secondaryButton}
            >
              <Text style={styles.dangerText}>Delete pet</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      {selectedTag?.recoveryUrl ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{selectedTag.label}</Text>
            <View style={styles.printCard}>
              <Text style={styles.printPetName}>{pet.name.toUpperCase()}</Text>
              <Text style={styles.lostLabel}>I&apos;M LOST</Text>
              <RecoveryQr
                value={selectedTag.recoveryUrl}
                size={190}
                getRef={(ref) => {
                  qrRef.current = ref;
                }}
              />
              <Text style={styles.scanHelp}>SCAN TO HELP ME GET HOME</Text>
              <Text style={styles.printCode}>{selectedTag.shortCode}</Text>
              <Text style={styles.brand}>PetConnect</Text>
            </View>

            <View style={styles.exportRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void exportTag(Platform.OS === "web" ? "download" : "share")
                }
                style={styles.exportButton}
              >
                <ShareIcon />
                <Text style={styles.exportText}>
                  {Platform.OS === "web" ? "Download" : "Share"}
                </Text>
              </Pressable>
              {Platform.OS === "web" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void exportTag("print")}
                  style={styles.exportButton}
                >
                  <Text style={styles.exportText}>Print</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedTag(null)}
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Delete {pet.name}?</Text>
            <Text style={styles.deleteNote}>
              This removes the pet and all tags.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => void handleDelete()}
              style={styles.dangerButton}
            >
              {deleting ? (
                <ActivityIndicator color={Palette.white} />
              ) : (
                <Text style={styles.dangerButtonText}>Delete pet</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => setConfirmingDelete(false)}
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Cancel</Text>
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
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: "100%" },
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
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  petCard: {
    marginTop: Spacing.three,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
  },
  photo: {
    width: "100%",
    height: 190,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: Spacing.three, gap: Spacing.two },
  breed: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
    color: Palette.white,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: Spacing.one },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.sage,
  },
  sectionHeader: {
    marginTop: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  addButton: {
    minHeight: 38,
    minWidth: 92,
    paddingHorizontal: Spacing.two,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  tagCard: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  tagTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  tagCopy: { flex: 1 },
  tagName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  tagCode: {
    marginTop: 3,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Palette.inkMuted,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: Palette.sage,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
  },
  statusPillInactive: { backgroundColor: Palette.borderSoft },
  statusPillText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  scanMeta: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  tagActions: {
    marginTop: Spacing.three,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  tagBusy: { marginTop: Spacing.three, alignSelf: "flex-start" },
  primarySmall: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primarySmallText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.white,
  },
  smallButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  actionRow: {
    marginTop: Spacing.four,
    flexDirection: "row",
    gap: Spacing.two,
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
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  dangerText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.danger,
  },
  errorText: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.danger,
  },
  linkLabel: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  qrWrap: {
    backgroundColor: Palette.surface,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(20,40,28,0.46)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  sheet: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "92%",
    borderRadius: 20,
    padding: Spacing.four,
    backgroundColor: Palette.cream,
    alignItems: "center",
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  printCard: {
    marginTop: Spacing.three,
    alignSelf: "stretch",
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    padding: Spacing.four,
    alignItems: "center",
  },
  printPetName: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: "900",
    color: Palette.forestDark,
  },
  lostLabel: {
    marginTop: 2,
    marginBottom: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: Palette.danger,
  },
  scanHelp: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  printCode: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
    color: Palette.forestDark,
  },
  brand: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    color: Palette.inkMuted,
  },
  exportRow: {
    alignSelf: "stretch",
    marginTop: Spacing.three,
    flexDirection: "row",
    gap: Spacing.two,
  },
  exportButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    flexDirection: "row",
    gap: Spacing.one,
    alignItems: "center",
    justifyContent: "center",
  },
  exportText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  doneButton: {
    alignSelf: "stretch",
    minHeight: 44,
    marginTop: Spacing.two,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  deleteNote: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  dangerButton: {
    alignSelf: "stretch",
    minHeight: 46,
    marginTop: Spacing.three,
    borderRadius: 12,
    backgroundColor: Palette.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.white,
  },
});
