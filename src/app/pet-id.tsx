import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    Share as NativeShare,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    BackArrow,
    BellIcon,
    CheckIcon,
    HealthIcon,
    PawIcon,
    PinIcon,
    ShareIcon,
    ShieldIcon,
    WarningIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { QrCode } from "@/components/pet-qr";
import { RecoveryReportSheet } from "@/components/recovery-report";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { activeLostAlertForPet, useLostPetAlerts } from "@/lib/lost-pets";
import { goBack } from "@/lib/navigation";
import { encodePetQr, petAge, seedPets, usePets } from "@/lib/pets";

export default function PetIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const requested = Array.isArray(params.name) ? params.name[0] : params.name;
  const petName = requested ?? "Bantay";
  const pets = usePets();
  const pet =
    pets.find((candidate) => candidate.name === petName) ??
    (pets.length === 0
      ? (seedPets.find((candidate) => candidate.name === petName) ?? null)
      : null);
  const lostAlerts = useLostPetAlerts();

  const [sharing, setSharing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  if (!pet) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Pet not found</Text>
            <Text style={styles.emptyText}>
              We could not find &quot;{petName}&quot;. It may have been removed
              or renamed.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack("/dashboard")}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.actionPrimaryLabel}>Back to dashboard</Text>
            </Pressable>
          </View>
          <BottomNav active="home" />
        </SafeAreaView>
      </View>
    );
  }

  const lostAlert = activeLostAlertForPet(lostAlerts, pet.id);
  const isLost = Boolean(lostAlert);

  const contactVisible = pet.finderContactVisible;

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
          <Text style={styles.petName}>{petName}</Text>
          <Text style={styles.supporting}>
            This recovery-safe profile helps identify {petName} if {petName}{" "}
            ever gets lost.
          </Text>

          <View style={styles.petCard}>
            <View style={styles.photo}>
              {pet.photo ? (
                <Image
                  source={{ uri: pet.photo }}
                  style={styles.photoImage}
                  contentFit="cover"
                />
              ) : (
                <>
                  <PawIcon size={72} color={Palette.forestDark} />
                  <Text style={styles.photoCaption}>{pet.breed}</Text>
                </>
              )}
            </View>
            <View style={styles.photoDivider} />
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{pet.name}</Text>
              <Text style={styles.cardBreed}>{pet.breed}</Text>
              <Text
                style={styles.cardMeta}
              >{`${pet.sex} · ${petAge(pet)}`}</Text>

              <View style={styles.verifiedRow}>
                <ShieldIcon size={13} color={Palette.forestDark} />
                <Text style={styles.verifiedLabel}>Verified Pet ID</Text>
              </View>
            </View>
          </View>

          <View style={styles.idCard}>
            <View style={styles.idCardTop}>
              <View style={styles.idText}>
                <Text style={styles.idLabel}>UNIQUE PET ID</Text>
                <Text style={styles.idValue}>{pet.id}</Text>
              </View>
              <QrCode seed={pet.id} value={encodePetQr(pet)} size={84} />
            </View>
            <Text style={styles.idScanLabel}>Scan to verify</Text>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, isLost ? styles.statusDotLost : null]}
            />
            <Text
              style={[
                styles.statusLabel,
                isLost ? styles.statusLabelLost : null,
              ]}
            >
              {isLost
                ? "Lost pet — Recovery alert active"
                : "Recovery profile active"}
            </Text>
          </View>

          {isLost && lostAlert ? (
            <View style={styles.lostCard}>
              <View style={styles.lostTitleRow}>
                <WarningIcon size={16} color={Palette.gold} />
                <Text style={styles.lostTitle}>
                  {pet.name.toUpperCase()} IS REPORTED LOST
                </Text>
              </View>
              <Text style={styles.lostSub}>
                Please help reunite {pet.name} with its owner.
              </Text>
              <View style={styles.lastSeen}>
                <PinIcon size={18} color={Palette.white} />
                <View style={styles.lastSeenText}>
                  <Text style={styles.lastSeenLabel}>LAST SEEN</Text>
                  <Text style={styles.lastSeenValue}>
                    {lostAlert.locationName}
                  </Text>
                </View>
              </View>
              {reportSent ? (
                <View style={styles.foundDone}>
                  <CheckIcon size={16} color={Palette.forestDark} />
                  <Text style={styles.foundDoneLabel}>Recovery alert sent</Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReportOpen(true)}
                  style={({ pressed }) => [
                    styles.foundButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <CheckIcon size={16} color={Palette.forestDark} />
                  <Text style={styles.foundLabel}>I Found This Pet</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryLabel}>RECOVERY CONTACT</Text>
            {contactVisible ? (
              <>
                <Text style={styles.recoveryName}>{pet.contactName}</Text>
                <Text style={styles.recoveryMeta}>
                  {pet.contactMobile} · {pet.contactLocation}
                </Text>
                <View style={styles.recoveryDivider} />
                <View style={styles.recoveryNoteRow}>
                  <ShieldIcon size={13} color={Palette.gold} />
                  <Text style={styles.recoveryNote}>
                    Visible to people who scan this Pet ID.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.recoveryHidden}>
                  The owner has chosen not to share their recovery contact.
                </Text>
                <Text style={styles.recoveryHiddenSub}>
                  Report the pet through the Lost &amp; Found feed instead.
                </Text>
              </>
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSharing(true)}
              style={({ pressed }) => [
                isLost ? styles.secondaryButton : styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <ShareIcon />
              <Text style={styles.actionPrimaryLabel}>Share QR</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/health-records",
                  params: { name: petName },
                })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <HealthIcon size={18} />
              <Text style={styles.actionSecondaryLabel}>Health</Text>
            </Pressable>
          </View>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {sharing ? (
        <View style={styles.overlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Share {petName}&apos;s Pet ID</Text>
            <View style={styles.shareCard}>
              <View style={styles.sharePhoto}>
                {pet.photo ? (
                  <Image
                    source={{ uri: pet.photo }}
                    style={styles.sharePhotoImage}
                    contentFit="cover"
                  />
                ) : (
                  <PawIcon size={40} color={Palette.forestDark} />
                )}
              </View>
              <View style={styles.shareNameRow}>
                <Text style={styles.shareName}>{petName}</Text>
                {lostAlert ? (
                  <View style={styles.shareLostBadge}>
                    <WarningIcon size={11} color={Palette.forestDark} />
                    <Text style={styles.shareLostBadgeLabel}>LOST PET</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={styles.shareMeta}
              >{`${pet.breed} · ${pet.sex}`}</Text>
              <QrCode seed={pet.id} value={encodePetQr(pet)} size={160} />
              <Text style={styles.shareId}>{pet.id}</Text>
            </View>
            <Text style={styles.privacyNote}>
              Only recovery-safe information is shared.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void NativeShare.share({
                  title: `${petName}'s Pet ID`,
                  message: `Scan this Pet-Connect QR or use Pet ID ${pet.id} to help reunite ${petName} with their owner.`,
                })
              }
              style={({ pressed }) => [
                styles.shareAction,
                pressed && styles.pressed,
              ]}
            >
              <ShareIcon size={16} />
              <Text style={styles.shareActionLabel}>Share Pet ID</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSharing(false)}
              style={({ pressed }) => [
                styles.shareClose,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.shareCloseLabel}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <RecoveryReportSheet
        pet={pet}
        lostAlert={lostAlert}
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => {
          setReportOpen(false);
          setReportSent(true);
        }}
      />
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
  petName: {
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
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    boxShadow: "0px 5px 12px rgba(27,67,50,0.1)",
  },
  photo: {
    height: 204,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoCaption: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  photoDivider: {
    height: 1,
    backgroundColor: Palette.borderSoft,
  },
  cardBody: {
    padding: Spacing.four,
    gap: 3,
  },
  cardName: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  cardBreed: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  cardMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    alignSelf: "flex-start",
    backgroundColor: Palette.sage,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    marginTop: Spacing.three,
  },
  verifiedLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Palette.forestDark,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: "center",
    maxWidth: 300,
    marginBottom: Spacing.two,
  },
  idCard: {
    marginTop: Spacing.four,
    borderRadius: 16,
    backgroundColor: Palette.forestDark,
    padding: Spacing.four,
    boxShadow: "0px 5px 12px rgba(27,67,50,0.14)",
  },
  idCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  idText: {
    flex: 1,
    gap: 4,
  },
  idLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#C9DBC6",
  },
  idValue: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.white,
    letterSpacing: 0.5,
  },
  idScanLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#C9DBC6",
    textAlign: "center",
    marginTop: Spacing.two,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingHorizontal: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.forestDark,
  },
  statusDotLost: {
    backgroundColor: Palette.gold,
  },
  statusLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  statusLabelLost: {
    color: Palette.danger,
  },
  lostCard: {
    marginTop: Spacing.four,
    backgroundColor: Palette.danger,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
    boxShadow: "0px 5px 12px rgba(122,59,29,0.25)",
  },
  lostTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  lostTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Palette.white,
  },
  lostSub: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: Palette.white,
  },
  lastSeen: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: Spacing.three,
  },
  lastSeenText: {
    flex: 1,
    gap: 2,
  },
  lastSeenLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#F8E1C4",
  },
  lastSeenValue: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.white,
  },
  foundButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    boxShadow: "0px 4px 10px rgba(242,182,50,0.35)",
  },
  foundLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  foundDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  foundDoneLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.white,
  },
  recoveryCard: {
    marginTop: Spacing.four,
    minHeight: 84,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    justifyContent: "center",
    gap: 2,
    boxShadow: "0px 3px 8px rgba(27,67,50,0.05)",
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
    marginTop: 2,
  },
  recoveryMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  recoveryDivider: {
    height: 1,
    backgroundColor: Palette.borderSoft,
    marginTop: Spacing.three,
  },
  recoveryNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  recoveryNote: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  recoveryHidden: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  recoveryHiddenSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  actionPrimaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  actionSecondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
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
    maxWidth: 340,
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
  sharePhoto: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sharePhotoImage: {
    width: "100%",
    height: "100%",
  },
  shareName: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.white,
  },
  shareNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  shareLostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  shareLostBadgeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: Palette.forestDark,
  },
  shareMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#C9DBC6",
  },
  shareId: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.white,
    letterSpacing: 0.5,
  },
  privacyNote: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  shareClose: {
    alignSelf: "stretch",
    height: 44,
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
  shareAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginBottom: Spacing.two,
  },
  shareActionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
