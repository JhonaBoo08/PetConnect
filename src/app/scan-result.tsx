import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    BackArrow,
    BellIcon,
    CheckIcon,
    PawIcon,
    PinIcon,
    ShieldIcon,
    WarningIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { QrCode } from "@/components/pet-qr";
import { RecoveryReportSheet } from "@/components/recovery-report";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { timestampToFullDate } from "@/lib/date";
import { activeLostAlertForPet, useLostPetAlerts } from "@/lib/lost-pets";
import { goBack } from "@/lib/navigation";
import { getPetByIdSync, petAge, usePets } from "@/lib/pets";
import { getPreferencesFor, useSession } from "@/lib/session";

function maskMobile(mobile: string): string {
  const parts = mobile.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return mobile;
  const head = parts[0];
  const first = parts[1];
  const last = parts[parts.length - 1];
  const tail = last.length >= 3 ? `••${last.slice(-2)}` : "••";
  const inner = parts.slice(2, -1).map(() => "•••");
  return [head, first, ...inner, tail].join(" ");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string; report?: string }>();
  const petIdParam = Array.isArray(params.pet)
    ? params.pet[0]
    : (params.pet ?? "");
  const shouldOpenReport = params.report === "1";
  const session = useSession();
  const pets = usePets();
  const lostAlerts = useLostPetAlerts();
  const pet =
    pets.find((candidate) => candidate.id === petIdParam) ??
    getPetByIdSync(petIdParam) ??
    null;
  const lostAlert = pet ? activeLostAlertForPet(lostAlerts, pet.id) : null;
  const isLost = Boolean(lostAlert);

  const [reportOpen, setReportOpen] = useState(shouldOpenReport);
  const [submitted, setSubmitted] = useState(false);

  const returnToScanner = () => {
    setSubmitted(false);
    goBack("/scan");
  };

  if (!pet) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/scan")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.centerWrap}>
            <View style={styles.centerIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Pet profile unavailable</Text>
            <Text style={styles.emptyText}>
              This Pet-Connect ID could not be found.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack("/scan")}
              style={({ pressed }) => [
                styles.fullButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.fullButtonLabel}>Scan again</Text>
            </Pressable>
          </View>
          <BottomNav active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerWrap}>
            <View style={styles.successIcon}>
              <CheckIcon size={28} color={Palette.white} />
            </View>
            <Text style={styles.successTitle}>Recovery alert sent</Text>
            <Text style={styles.emptyText}>
              The pet owner has been notified that someone found their pet.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={returnToScanner}
              style={({ pressed }) => [
                styles.fullButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.fullButtonLabel}>Return to scanner</Text>
            </Pressable>
          </View>
          <BottomNav active="scan" />
        </SafeAreaView>
      </View>
    );
  }

  const showRecoveryContact = session.ready
    ? getPreferencesFor(pet.ownerId).showRecoveryContact
    : true;
  const contactVisible = pet.finderContactVisible && showRecoveryContact;

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
              onPress={() => goBack("/scan")}
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

          {isLost ? (
            <View style={styles.lostHeader}>
              <View style={styles.lostHeaderRow}>
                <View style={styles.lostThumb}>
                  {pet.photo ? (
                    <Image
                      source={{ uri: pet.photo }}
                      style={styles.lostThumbImage}
                      contentFit="cover"
                    />
                  ) : (
                    <PawIcon size={30} color={Palette.forestDark} />
                  )}
                </View>
                <View style={styles.lostBody}>
                  <View style={styles.lostPill}>
                    <WarningIcon size={13} color={Palette.forestDark} />
                    <Text style={styles.lostPillLabel}>LOST PET</Text>
                  </View>
                  <Text style={styles.lostName}>{pet.name}</Text>
                  <Text style={styles.lostMeta}>
                    {pet.species} · {pet.breed} · {pet.sex}
                  </Text>
                  <Text style={styles.lostId}>{pet.id}</Text>
                </View>
              </View>
              <Text style={styles.lostStatement}>
                {pet.name} has been reported lost.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.category}>DIGITAL PET ID</Text>
              <Text style={styles.petName}>{pet.name}</Text>
              <Text style={styles.supporting}>
                This recovery-safe card can be shared when {pet.name} needs
                help.
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
                      <PawIcon size={64} color={Palette.forestDark} />
                      <Text style={styles.photoCaption}>{pet.breed}</Text>
                    </>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.breedRow}>
                    <Text style={styles.breed}>{pet.breed}</Text>
                    <ShieldIcon size={24} />
                  </View>
                  <Text
                    style={styles.meta}
                  >{`${pet.sex} · ${petAge(pet)}`}</Text>
                  <View style={styles.idPanel}>
                    <View style={styles.idText}>
                      <Text style={styles.idLabel}>UNIQUE PET ID</Text>
                      <Text style={styles.idValue}>{pet.id}</Text>
                    </View>
                    <QrCode seed={pet.id} size={72} />
                  </View>
                </View>
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>
            {isLost ? "PET INFORMATION" : "PET INFO"}
          </Text>
          <View style={styles.detailCard}>
            <InfoRow label="Species" value={pet.species} />
            <InfoRow label="Breed" value={pet.breed} />
            <InfoRow label="Sex" value={pet.sex} />
            <InfoRow label="Age" value={petAge(pet)} />
            <InfoRow label="Pet-Connect ID" value={pet.id} />
            {pet.details ? (
              <InfoRow label="Identifying details" value={pet.details} />
            ) : null}
            {pet.collar ? <InfoRow label="Collar" value={pet.collar} /> : null}
          </View>

          <Text style={styles.sectionLabel}>OWNER / RECOVERY CONTACT</Text>
          {contactVisible ? (
            <View style={styles.ownerCard}>
              <Text style={styles.ownerName}>{pet.contactName}</Text>
              <Text style={styles.ownerMeta}>
                {maskMobile(pet.contactMobile)}
              </Text>
              <Text style={styles.ownerMeta}>{pet.contactLocation}</Text>
            </View>
          ) : (
            <View style={styles.ownerCard}>
              <Text style={styles.ownerHidden}>
                {showRecoveryContact
                  ? "The owner has chosen not to share their recovery contact."
                  : "Contact information is protected. Please use Pet-Connect\u2019s recovery request."}
              </Text>
              {showRecoveryContact ? (
                <Text style={styles.ownerHiddenSub}>
                  Report the pet through the Lost &amp; Found feed instead.
                </Text>
              ) : null}
            </View>
          )}

          {isLost && lostAlert ? (
            <>
              <Text style={styles.sectionLabel}>LAST SEEN</Text>
              <View style={styles.detailCard}>
                <View style={styles.seenRow}>
                  <PinIcon size={17} color={Palette.forestDark} />
                  <View style={styles.seenText}>
                    <Text style={styles.seenTitle}>
                      {lostAlert.locationName}
                    </Text>
                    <Text style={styles.seenSub}>
                      Reported {timestampToFullDate(lostAlert.createdAt)}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setReportOpen(true)}
                style={({ pressed }) => [
                  styles.foundButton,
                  pressed && styles.pressed,
                ]}
              >
                <CheckIcon />
                <Text style={styles.foundLabel}>I Found This Pet</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <BottomNav active="scan" />
      </SafeAreaView>

      <RecoveryReportSheet
        pet={pet}
        lostAlert={lostAlert}
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => {
          setReportOpen(false);
          setSubmitted(true);
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
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  lostHeader: {
    backgroundColor: Palette.danger,
    borderRadius: 18,
    padding: Spacing.four,
    marginTop: Spacing.five,
    gap: Spacing.three,
    boxShadow: "0px 5px 12px rgba(122,59,29,0.25)",
  },
  lostHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  lostThumb: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lostThumbImage: {
    width: "100%",
    height: "100%",
  },
  lostBody: {
    flex: 1,
    gap: 3,
  },
  lostPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  lostPillLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: Palette.forestDark,
  },
  lostName: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: "800",
    color: Palette.white,
    marginTop: 2,
  },
  lostMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: "#F8E1C4",
  },
  lostId: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.white,
    letterSpacing: 0.5,
  },
  lostStatement: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: "700",
    color: Palette.white,
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
    boxShadow: "0px 5px 12px rgba(27,67,50,0.12)",
  },
  photo: {
    height: 168,
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
    justifyContent: "space-between",
    gap: Spacing.three,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  idText: {
    flex: 1,
    gap: 3,
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
    fontSize: 12,
    fontWeight: "800",
    color: Palette.white,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  detailCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  infoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.inkMuted,
  },
  infoValue: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
    textAlign: "right",
  },
  ownerCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 2,
    alignItems: "center",
  },
  ownerName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  ownerMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    textAlign: "center",
  },
  ownerHidden: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
    textAlign: "center",
  },
  ownerHiddenSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: 2,
  },
  seenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  seenText: {
    flex: 1,
  },
  seenTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  seenSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  foundButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
    boxShadow: "0px 4px 10px rgba(242,182,50,0.3)",
  },
  foundLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  centerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.two,
  },
  successTitle: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: "800",
    color: Palette.forestDark,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: Palette.inkMuted,
  },
  fullButton: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.three,
  },
  fullButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
