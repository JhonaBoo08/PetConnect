import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  PawIcon,
  PinIcon,
  SendIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { RecoveryMap } from "@/components/recovery-map";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  enableRecoveryPush,
  requestCurrentCoordinates,
} from "@/services/device-recovery";
import { listPets } from "@/services/pets";
import {
  createLostReport,
  getNearbyLostReports,
  listMyLostReports,
  listRecoveryNotifications,
  markPetReunited,
  markRecoveryNotificationRead,
} from "@/services/recovery-network";
import type {
  Coordinates,
  LostReport,
  NearbyLostReport,
  Pet,
  RecoveryNotification,
} from "../../../shared/contracts";

type Mode = "report" | "feed" | "updates";

function statusLabel(
  status: LostReport["status"] | NearbyLostReport["status"],
) {
  if (status === "SIGHTED") return "Sighted";
  if (status === "REUNITED") return "Reunited";
  return "Lost";
}

function when(value: string) {
  return new Date(value).toLocaleString();
}

export default function AlertsScreen() {
  const [mode, setMode] = useState<Mode>("report");
  const [pets, setPets] = useState<Pet[]>([]);
  const [reports, setReports] = useState<LostReport[]>([]);
  const [nearby, setNearby] = useState<NearbyLostReport[]>([]);
  const [notifications, setNotifications] = useState<RecoveryNotification[]>(
    [],
  );
  const [selectedPetId, setSelectedPetId] = useState("");
  const [lastSeenText, setLastSeenText] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pushMessage, setPushMessage] = useState("");

  const loadCore = useCallback(async () => {
    const [petRows, reportRows, notificationRows] = await Promise.all([
      listPets(),
      listMyLostReports(),
      listRecoveryNotifications(),
    ]);
    setPets(petRows);
    setReports(reportRows);
    setNotifications(notificationRows);
    setSelectedPetId((current) => current || petRows[0]?.id || "");
  }, []);

  const loadNearby = useCallback(async (coordinates: Coordinates) => {
    const rows = await getNearbyLostReports(
      coordinates.latitude,
      coordinates.longitude,
      10,
    );
    setNearby(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadCore()
        .catch((cause) => {
          if (active) setError(authErrorMessage(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [loadCore]),
  );

  async function useGps(loadFeed = false) {
    setLoadingLocation(true);
    setError("");
    try {
      const next = await requestCurrentCoordinates();
      setLocation(next);
      if (loadFeed || mode === "feed") await loadNearby(next);
      return next;
    } catch (cause) {
      setError(authErrorMessage(cause));
      return null;
    } finally {
      setLoadingLocation(false);
    }
  }

  async function publish() {
    if (!selectedPetId) {
      setError("Add a pet before publishing a lost report.");
      return;
    }
    if (!lastSeenText.trim()) {
      setError("Describe where your pet was last seen.");
      return;
    }
    const pin = location || (await useGps());
    if (!pin) return;

    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const report = await createLostReport({
        petId: selectedPetId,
        lastSeenText,
        details,
        latitude: pin.latitude,
        longitude: pin.longitude,
        accuracyM: pin.accuracyM,
      });
      setReports(await listMyLostReports());
      setLastSeenText("");
      setDetails("");
      setMessage(
        `${report.petName} is now in the recovery network. Nearby members with recovery alerts enabled can be notified.`,
      );
      setMode("feed");
      await loadNearby(pin);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPublishing(false);
    }
  }

  async function reunite(report: LostReport) {
    setError("");
    try {
      await markPetReunited(report.id);
      setReports(await listMyLostReports());
      if (location) await loadNearby(location);
      setMessage(`${report.petName} has been marked reunited.`);
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  }

  async function enablePush() {
    setPushMessage("");
    setError("");
    try {
      const coordinates = location || (await useGps());
      const result = await enableRecoveryPush(coordinates || undefined);
      setPushMessage(
        result.enabled
          ? "Recovery push alerts are enabled on this device."
          : result.reason,
      );
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await loadCore();
      if (mode === "feed") {
        const coordinates = location || (await useGps());
        if (coordinates) await loadNearby(coordinates);
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  async function openUpdate(item: RecoveryNotification) {
    if (!item.readAt) {
      try {
        await markRecoveryNotificationRead(item.id);
        setNotifications((rows) =>
          rows.map((row) =>
            row.id === item.id
              ? { ...row, readAt: new Date().toISOString() }
              : row,
          ),
        );
      } catch {
        // The notification content is still safe to show if read-state sync fails.
      }
    }
  }

  const activeCases = reports.filter((report) => report.status !== "REUNITED");
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
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
              accessibilityLabel="Recovery notifications"
              onPress={() => setMode("updates")}
              style={styles.iconButton}
            >
              <BellIcon />
              {unreadCount ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>

          <Text style={styles.category}>RECOVERY NETWORK</Text>
          <Text style={styles.heading}>Lost, sighted, reunited.</Text>
          <Text style={styles.supporting}>
            Publish a GPS-backed lost report, see nearby cases, and receive
            finder sightings without exposing private account data.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void enablePush()}
            style={styles.alertButton}
          >
            <BellIcon size={18} />
            <Text style={styles.alertButtonText}>Enable recovery alerts</Text>
          </Pressable>
          {pushMessage ? (
            <Text style={styles.helper}>{pushMessage}</Text>
          ) : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.segment}>
            {(["report", "feed", "updates"] as Mode[]).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === key }}
                onPress={() => {
                  setMode(key);
                  if (key === "feed" && location) void loadNearby(location);
                }}
                style={[
                  styles.segmentItem,
                  mode === key && styles.segmentItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    mode === key && styles.segmentLabelActive,
                  ]}
                >
                  {key === "report"
                    ? "Report lost"
                    : key === "feed"
                      ? "Nearby"
                      : `Updates${unreadCount ? ` (${unreadCount})` : ""}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : null}

          {!loading && mode === "report" ? (
            <>
              {activeCases.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Your active recovery cases
                  </Text>
                  {activeCases.map((report) => (
                    <View key={report.id} style={styles.caseCard}>
                      <View style={styles.caseTop}>
                        <View>
                          <Text style={styles.caseName}>{report.petName}</Text>
                          <Text style={styles.caseMeta}>
                            {statusLabel(report.status)} ·{" "}
                            {report.sightingCount} sighting
                            {report.sightingCount === 1 ? "" : "s"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            report.status === "SIGHTED" && styles.statusSighted,
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {statusLabel(report.status).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.caseLocation}>
                        {report.lastSeenText}
                      </Text>
                      {report.lastSightedAt ? (
                        <Text style={styles.helper}>
                          Latest sighting: {when(report.lastSightedAt)}
                        </Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void reunite(report)}
                        style={styles.reuniteButton}
                      >
                        <CheckIcon size={15} color={Palette.white} />
                        <Text style={styles.reuniteText}>Mark reunited</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Publish lost report</Text>
                <Text style={styles.label}>Pet</Text>
                <View style={styles.petChoices}>
                  {pets.map((pet) => (
                    <Pressable
                      key={pet.id}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: selectedPetId === pet.id,
                      }}
                      onPress={() => setSelectedPetId(pet.id)}
                      style={[
                        styles.petChoice,
                        selectedPetId === pet.id && styles.petChoiceActive,
                      ]}
                    >
                      <PawIcon size={17} color={Palette.forestDark} />
                      <Text style={styles.petChoiceText}>{pet.name}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Last seen</Text>
                <TextInput
                  value={lastSeenText}
                  onChangeText={setLastSeenText}
                  placeholder="e.g. Freedom Park, Tagum"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />

                <Text style={styles.label}>Details</Text>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Collar, behavior, direction of travel..."
                  placeholderTextColor={Palette.placeholder}
                  multiline
                  style={[styles.input, styles.textArea]}
                />

                <Text style={styles.label}>Last known GPS pin</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingLocation}
                  onPress={() => void useGps()}
                  style={styles.gpsButton}
                >
                  {loadingLocation ? (
                    <ActivityIndicator color={Palette.forestDark} />
                  ) : (
                    <>
                      <PinIcon size={19} />
                      <Text style={styles.gpsText}>
                        {location ? "Refresh my GPS" : "Use my GPS"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <RecoveryMap
                  selected={
                    location
                      ? {
                          latitude: location.latitude,
                          longitude: location.longitude,
                        }
                      : null
                  }
                  pins={[]}
                  onSelect={(coordinate) =>
                    setLocation((current) => ({
                      ...coordinate,
                      accuracyM: current?.accuracyM ?? null,
                    }))
                  }
                  height={230}
                />
                {location ? (
                  <Text style={styles.helper}>
                    Pin: {location.latitude.toFixed(5)},{" "}
                    {location.longitude.toFixed(5)}
                    {location.accuracyM
                      ? ` · ±${Math.round(location.accuracyM)} m`
                      : ""}
                  </Text>
                ) : null}

                <Text style={styles.publicWarning}>
                  This location becomes public while the report is active so
                  finders can search around the last known area.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  disabled={publishing}
                  onPress={() => void publish()}
                  style={styles.publishButton}
                >
                  {publishing ? (
                    <ActivityIndicator color={Palette.forestDark} />
                  ) : (
                    <>
                      <SendIcon />
                      <Text style={styles.publishText}>
                        Publish lost report
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}

          {!loading && mode === "feed" ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Nearby recovery feed</Text>
                  <Text style={styles.helper}>Active cases within 10 km.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingLocation}
                  onPress={() => void useGps(true)}
                  style={styles.smallButton}
                >
                  <PinIcon size={16} />
                  <Text style={styles.smallButtonText}>Locate</Text>
                </Pressable>
              </View>

              {location ? (
                <RecoveryMap
                  pins={nearby.map((report) => ({
                    id: report.id,
                    latitude: report.latitude,
                    longitude: report.longitude,
                    title: report.petName,
                    description: `${statusLabel(report.status)} · ${report.distanceKm.toFixed(1)} km`,
                    status: report.status,
                  }))}
                  selected={null}
                  height={270}
                />
              ) : (
                <View style={styles.emptyCard}>
                  <PinIcon size={24} />
                  <Text style={styles.emptyTitle}>Location needed</Text>
                  <Text style={styles.helper}>
                    Use your GPS to load reports around you.
                  </Text>
                </View>
              )}

              <View style={styles.feedList}>
                {nearby.map((report) => (
                  <View key={report.id} style={styles.feedCard}>
                    <View style={styles.feedTop}>
                      <View style={styles.feedIdentity}>
                        <View style={styles.feedPhoto}>
                          <PawIcon size={24} color={Palette.forestDark} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.caseName}>{report.petName}</Text>
                          <Text style={styles.caseMeta}>
                            {report.petBreed || report.petSpecies}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          report.status === "SIGHTED" && styles.statusSighted,
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {statusLabel(report.status).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.caseLocation}>
                      {report.lastSeenText} · {report.distanceKm.toFixed(1)} km
                      away
                    </Text>
                    {report.details ? (
                      <Text style={styles.feedDetails}>{report.details}</Text>
                    ) : null}
                    <Text style={styles.helper}>
                      {report.status === "SIGHTED" && report.lastSightedAt
                        ? `Latest sighting ${when(report.lastSightedAt)}`
                        : `Reported ${when(report.reportedAt)}`}
                    </Text>
                  </View>
                ))}
                {location && nearby.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <CheckIcon size={22} color={Palette.forestDark} />
                    <Text style={styles.emptyTitle}>
                      No active cases nearby
                    </Text>
                    <Text style={styles.helper}>
                      No LOST or SIGHTED reports were found within 10 km.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {!loading && mode === "updates" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recovery updates</Text>
              <Text style={styles.helper}>
                Finder sightings and nearby lost-pet alerts are stored here even
                when remote push delivery is unavailable.
              </Text>
              <View style={styles.feedList}>
                {notifications.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => void openUpdate(item)}
                    style={[
                      styles.updateCard,
                      !item.readAt && styles.updateUnread,
                    ]}
                  >
                    <Text style={styles.updateTitle}>{item.title}</Text>
                    <Text style={styles.feedDetails}>{item.body}</Text>
                    <Text style={styles.helper}>{when(item.createdAt)}</Text>
                  </Pressable>
                ))}
                {notifications.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <BellIcon size={22} />
                    <Text style={styles.emptyTitle}>
                      No recovery updates yet
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>
        <BottomNav active="alerts" />
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
    paddingBottom: Spacing.five,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 8,
    right: 8,
    backgroundColor: Palette.gold,
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  alertButton: {
    marginTop: Spacing.three,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  alertButtonText: {
    fontFamily: Fonts.sans,
    fontWeight: "800",
    fontSize: 13,
    color: Palette.forestDark,
  },
  segment: {
    flexDirection: "row",
    marginTop: Spacing.four,
    padding: 4,
    backgroundColor: Palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: {
    backgroundColor: Palette.sage,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.inkMuted,
  },
  segmentLabelActive: {
    color: Palette.forestDark,
    fontWeight: "800",
  },
  loader: {
    marginTop: Spacing.five,
  },
  section: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  caseCard: {
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  caseTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  caseName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  caseMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  caseLocation: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: Spacing.two,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: Palette.goldSoft,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  statusSighted: {
    backgroundColor: Palette.sage,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "800",
    color: Palette.forestDark,
    letterSpacing: 0.6,
  },
  reuniteButton: {
    marginTop: Spacing.three,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  reuniteText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.white,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  petChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  petChoice: {
    flexDirection: "row",
    gap: Spacing.one,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  petChoiceActive: {
    backgroundColor: Palette.sage,
    borderColor: Palette.forestDark,
  },
  petChoiceText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 90,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  gpsButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.goldTrack,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  gpsText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  publicWarning: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
    backgroundColor: Palette.goldTrack,
    borderRadius: 10,
    padding: Spacing.two,
  },
  publishButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  publishText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  helper: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  success: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.forestDark,
    backgroundColor: Palette.sage,
    borderRadius: 10,
    padding: Spacing.two,
    marginTop: Spacing.two,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.danger,
    marginTop: Spacing.two,
  },
  smallButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  smallButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  feedList: {
    gap: Spacing.three,
  },
  feedCard: {
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  feedTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  feedIdentity: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
  },
  feedPhoto: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  feedDetails: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  emptyCard: {
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    padding: Spacing.three,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  updateCard: {
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  updateUnread: {
    borderColor: Palette.forestDark,
    backgroundColor: Palette.sage,
  },
  updateTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
});
