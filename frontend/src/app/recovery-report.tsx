import { Image, type ImageSource } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  CheckIcon,
  PawIcon,
  PhoneIcon,
  PinIcon,
  ShieldIcon,
} from "@/components/app-icons";
import { RecoveryMap } from "@/components/recovery-map";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { getApiBaseUrl } from "@/services/auth";
import { authErrorMessage } from "@/services/auth-context";
import { firebaseClient } from "@/services/firebase/client";
import {
  getLostReport,
  getRecoveryContactEvent,
  markPetReunited,
  reportFinderSightingAbuse,
  reportRecoveryContactAbuse,
} from "@/services/recovery-network";
import type {
  LostReport,
  RecoveryContactEvent,
  Sighting,
  SightingEvidence,
} from "../../../shared/contracts";

type Detail =
  | { kind: "SIGHTING"; report: LostReport; item: Sighting }
  | { kind: "CONTACT"; item: RecoveryContactEvent };

function when(value: string) {
  return new Date(value).toLocaleString();
}

function phoneLike(value: string | null) {
  return Boolean(value && /^[+\d][\d\s().-]{6,}$/.test(value));
}

export default function RecoveryReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    reportId?: string;
    sightingId?: string;
    eventId?: string;
  }>();
  const reportId = Array.isArray(params.reportId)
    ? params.reportId[0]
    : params.reportId;
  const sightingId = Array.isArray(params.sightingId)
    ? params.sightingId[0]
    : params.sightingId;
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0]
    : params.eventId;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [authHeader, setAuthHeader] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmReunite, setConfirmReunite] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const user = firebaseClient().auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      setAuthHeader({ Authorization: `Bearer ${token}` });
    }

    if (eventId) {
      const item = await getRecoveryContactEvent(eventId);
      setDetail({ kind: "CONTACT", item });
      return;
    }
    if (!reportId || !sightingId) {
      throw new Error("This finder report link is incomplete.");
    }
    const result = await getLostReport(reportId);
    const item = result.sightings.find((row) => row.id === sightingId);
    if (!item) throw new Error("Finder report not found.");
    setDetail({ kind: "SIGHTING", report: result.report, item });
  }, [eventId, reportId, sightingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((cause) => {
        if (active) setError(authErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const item = detail?.item;
  const evidence = item?.evidence || [];
  const latitude = item?.latitude ?? null;
  const longitude = item?.longitude ?? null;

  const evidenceSources = useMemo(
    () =>
      evidence.map(
        (entry): { evidence: SightingEvidence; source: ImageSource } => ({
          evidence: entry,
          source: {
            uri: `${getApiBaseUrl()}${entry.url}`,
            headers: authHeader,
          },
        }),
      ),
    [authHeader, evidence],
  );

  async function reportAbuse() {
    if (!detail) return;
    setActionBusy(true);
    setError("");
    setMessage("");
    try {
      if (detail.kind === "SIGHTING") {
        await reportFinderSightingAbuse(detail.report.id, detail.item.id);
      } else {
        await reportRecoveryContactAbuse(detail.item.id);
      }
      setMessage(
        "Report flagged for review. Keep the evidence available until you confirm the situation.",
      );
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setActionBusy(false);
    }
  }

  async function reunite() {
    if (!detail || detail.kind !== "SIGHTING") return;
    setActionBusy(true);
    setError("");
    setMessage("");
    try {
      await markPetReunited(detail.report.id);
      setConfirmReunite(false);
      setMessage(
        `${detail.report.petName} is marked reunited. Finder reports remain visible for your recovery record.`,
      );
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setActionBusy(false);
    }
  }

  const contact = item?.finderContact || null;

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
              onPress={() => goBack("/alerts")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
          </View>

          <Text style={styles.category}>RECOVERY EVIDENCE</Text>
          <Text style={styles.heading}>Finder report</Text>
          <Text style={styles.supporting}>
            Review what the finder submitted before deciding what to do next.
          </Text>

          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading finder report"
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : null}

          {!loading && error && !detail ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Report unavailable</Text>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/alerts")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Back to recovery</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && detail && item ? (
            <>
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <View style={styles.summaryIcon}>
                    <PawIcon size={24} color={Palette.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petName}>
                      {detail.kind === "SIGHTING"
                        ? detail.report.petName
                        : detail.item.petName}
                    </Text>
                    <Text style={styles.when}>{when(item.createdAt)}</Text>
                  </View>
                  <View
                    style={[
                      styles.encounterPill,
                      item.encounterType === "HAVE_PET" &&
                        styles.encounterPillStrong,
                    ]}
                  >
                    <Text style={styles.encounterText}>
                      {item.encounterType === "HAVE_PET"
                        ? "HAS PET"
                        : "SAW PET"}
                    </Text>
                  </View>
                </View>

                {item.riskState === "REVIEW" ? (
                  <View style={styles.reviewWarning}>
                    <ShieldIcon size={18} color={Palette.danger} />
                    <Text style={styles.reviewText}>
                      Unverified report — review the details carefully.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.badges}>
                  {evidence.length ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Photo attached</Text>
                    </View>
                  ) : null}
                  {latitude !== null && longitude !== null ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {item.locationSource === "GPS"
                          ? "GPS shared"
                          : "Location shared"}
                      </Text>
                    </View>
                  ) : null}
                  {item.phoneVerified ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Phone verified</Text>
                    </View>
                  ) : null}
                  {item.contactShared ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Contact shared</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {evidenceSources.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Finder photo</Text>
                  <Text style={styles.helper}>
                    Finder-submitted evidence. It helps you assess the report,
                    but it is not proof of identity or custody.
                  </Text>
                  {evidenceSources.map(({ evidence: entry, source }) => (
                    <View key={entry.id} style={styles.photoFrame}>
                      <Image
                        source={source}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        accessibilityLabel="Finder-submitted pet photo"
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Location</Text>
                {latitude !== null && longitude !== null ? (
                  <>
                    <RecoveryMap
                      pins={[
                        {
                          id: item.id,
                          latitude,
                          longitude,
                          title:
                            item.encounterType === "HAVE_PET"
                              ? "Finder has pet"
                              : "Finder sighting",
                          description:
                            item.locationText ||
                            "Exact finder-submitted location",
                          status: "SIGHTED",
                        },
                      ]}
                      selected={null}
                      height={245}
                    />
                    <View style={styles.locationRow}>
                      <PinIcon size={17} />
                      <Text style={styles.locationText}>
                        {item.locationText || "Finder shared GPS"}
                        {item.accuracyM
                          ? ` · about ±${Math.round(item.accuracyM)} m`
                          : ""}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.infoBox}>
                    <PinIcon size={18} />
                    <Text style={styles.locationText}>
                      {item.locationText ||
                        "The finder did not share GPS or a location description."}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Finder details</Text>
                <View style={styles.detailCard}>
                  <Text style={styles.label}>NAME</Text>
                  <Text style={styles.value}>
                    {item.finderName || "Not provided"}
                  </Text>
                  <Text style={styles.label}>MESSAGE</Text>
                  <Text style={styles.value}>
                    {item.notes || "No message provided"}
                  </Text>
                  <Text style={styles.label}>CONTACT</Text>
                  <Text style={styles.value}>
                    {contact ||
                      (item.phoneVerified
                        ? "Verified privately, not shared with you"
                        : "Not shared")}
                  </Text>
                  {contact && phoneLike(contact) ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void Linking.openURL(`tel:${contact}`)}
                      style={styles.contactButton}
                    >
                      <PhoneIcon size={19} />
                      <Text style={styles.contactButtonText}>Call finder</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {message ? <Text style={styles.success}>{message}</Text> : null}
              {error && detail ? (
                <Text accessibilityRole="alert" style={styles.inlineError}>
                  {error}
                </Text>
              ) : null}

              {detail.kind === "SIGHTING" &&
              detail.report.status !== "REUNITED" ? (
                confirmReunite ? (
                  <View style={styles.confirmCard}>
                    <Text style={styles.confirmTitle}>
                      Confirm {detail.report.petName} is reunited?
                    </Text>
                    <Text style={styles.helper}>
                      A finder saying they have the pet does not confirm a
                      reunion. Only mark this after you have verified the pet is
                      safely back.
                    </Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={actionBusy}
                        onPress={() => setConfirmReunite(false)}
                        style={styles.secondaryAction}
                      >
                        <Text style={styles.secondaryActionText}>Not yet</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={actionBusy}
                        onPress={() => void reunite()}
                        style={styles.primaryAction}
                      >
                        {actionBusy ? (
                          <ActivityIndicator color={Palette.white} />
                        ) : (
                          <>
                            <CheckIcon size={15} color={Palette.white} />
                            <Text style={styles.primaryActionText}>
                              Mark reunited
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConfirmReunite(true)}
                    style={styles.primaryButton}
                  >
                    <CheckIcon size={16} color={Palette.white} />
                    <Text style={styles.primaryButtonText}>
                      I confirmed my pet is reunited
                    </Text>
                  </Pressable>
                )
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={actionBusy}
                onPress={() => void reportAbuse()}
                style={styles.abuseButton}
              >
                <ShieldIcon size={17} color={Palette.danger} />
                <Text style={styles.abuseButtonText}>
                  Report this finder submission
                </Text>
              </Pressable>

              <View style={styles.privacyCard}>
                <ShieldIcon size={20} />
                <Text style={styles.privacyText}>
                  PetConnect does not show the finder session identifier, IP
                  abuse signal, phone-verification number, or internal risk
                  metrics here. Contact details appear only when the finder
                  explicitly chose to share them.
                </Text>
              </View>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  topBar: {
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
    marginTop: Spacing.four,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.forestDark,
  },
  heading: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 28,
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
  loader: {
    marginTop: Spacing.five,
  },
  summaryCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.forestDark,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.white,
  },
  when: {
    marginTop: 2,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: "#C9DBC6",
  },
  encounterPill: {
    borderRadius: 999,
    backgroundColor: Palette.sage,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  encounterPillStrong: {
    backgroundColor: Palette.gold,
  },
  encounterText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Palette.forestDark,
  },
  reviewWarning: {
    marginTop: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#FBEDEA",
    borderRadius: 11,
    padding: Spacing.two,
  },
  reviewText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "700",
    color: Palette.danger,
  },
  badges: {
    marginTop: Spacing.three,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "700",
    color: Palette.white,
  },
  section: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  helper: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  photoFrame: {
    height: 260,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Palette.sage,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 11,
    backgroundColor: Palette.sage,
  },
  infoBox: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.three,
  },
  locationText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.forestDark,
  },
  detailCard: {
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  label: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
    color: Palette.inkMuted,
  },
  value: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.forestDark,
  },
  contactButton: {
    marginTop: Spacing.three,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  contactButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  success: {
    marginTop: Spacing.four,
    padding: Spacing.two,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.forestDark,
  },
  inlineError: {
    marginTop: Spacing.four,
    padding: Spacing.two,
    borderRadius: 10,
    backgroundColor: "#FBEDEA",
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.danger,
  },
  primaryButton: {
    marginTop: Spacing.four,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "800",
    color: Palette.white,
  },
  confirmCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.goldTrack,
  },
  confirmTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  actionRow: {
    marginTop: Spacing.three,
    flexDirection: "row",
    gap: Spacing.two,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
  },
  primaryActionText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.white,
  },
  abuseButton: {
    marginTop: Spacing.three,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E5C0B3",
    backgroundColor: "#FBEDEA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  abuseButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.danger,
  },
  privacyCard: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  errorCard: {
    marginTop: Spacing.five,
    padding: Spacing.four,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  errorTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorText: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
  },
  secondaryButton: {
    marginTop: Spacing.three,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
});
