import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackArrow, BellIcon, CheckIcon, ChevronRightIcon, PawIcon, PinIcon, SendIcon } from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { RecoveryMap } from "@/components/recovery-map";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage } from "@/services/auth-context";
import { requestCurrentCoordinates } from "@/services/device-recovery";
import { listPets } from "@/services/pets";
import {
  createLostReport, getLostReport, getNearbyLostReports, listMyLostReports,
  listRecoveryNotifications, markPetReunited,
} from "@/services/recovery-network";
import type { Coordinates, LostReport, NearbyLostReport, Pet, Sighting } from "../../../shared/contracts";

type Mode = "nearby" | "reports";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function statusLabel(status: LostReport["status"] | NearbyLostReport["status"]) {
  if (status === "SIGHTED") return "Sighted";
  if (status === "REUNITED") return "Reunited";
  return "Lost";
}
function when(value: string) {
  return new Date(value).toLocaleString();
}
function orderedMapSightings(sightings: Sighting[]) {
  return [...sightings]
    .filter(s => s.riskState !== "BLOCKED" && s.latitude !== null && s.longitude !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export default function RecoveryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; petId?: string; reportId?: string }>();
  const routeMode = firstParam(params.mode);
  const routePetId = firstParam(params.petId);
  const routeReportId = firstParam(params.reportId);
  const [mode, setMode] = useState<Mode>(routeReportId || routeMode === "report" || routeMode === "reports" ? "reports" : "nearby");
  const [showReportForm, setShowReportForm] = useState((routeMode === "report" || Boolean(routePetId)) && !routeReportId);
  const [pets, setPets] = useState<Pet[]>([]);
  const [reports, setReports] = useState<LostReport[]>([]);
  const [sightingsByReport, setSightingsByReport] = useState<Record<string, Sighting[]>>({});
  const [failedDetails, setFailedDetails] = useState<string[]>([]);
  const [nearby, setNearby] = useState<NearbyLostReport[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [lastSeenText, setLastSeenText] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [reportLocation, setReportLocation] = useState<Coordinates | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coreError, setCoreError] = useState("");
  const [nearbyError, setNearbyError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [reuniting, setReuniting] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const loadCore = useCallback(async (isActive: () => boolean = () => true) => {
    const [petRows, reportRows, notificationRows] = await Promise.all([
      listPets(), listMyLostReports(), listRecoveryNotifications().catch(() => []),
    ]);
    const cases = await Promise.all(reportRows.filter(r => r.status !== "REUNITED").map(async report => {
      try {
        const detail = await getLostReport(report.id);
        return { id: report.id, sightings: detail.sightings, failed: false };
      } catch {
        return { id: report.id, sightings: [] as Sighting[], failed: true };
      }
    }));
    if (!isActive()) return;
    setPets(petRows);
    setReports(reportRows);
    setUnreadCount(notificationRows.filter(n => !n.readAt).length);
    setSightingsByReport(Object.fromEntries(cases.map(c => [c.id, c.sightings])));
    setFailedDetails(cases.filter(c => c.failed).map(c => c.id));
    setCoreError("");
    setSelectedPetId(current => {
      if (routePetId && petRows.some(p => p.id === routePetId)) return routePetId;
      if (current && petRows.some(p => p.id === current)) return current;
      return petRows.length === 1 ? petRows[0].id : "";
    });
  }, [routePetId]);

  useEffect(() => {
    if (routeMode === "updates") {
      router.replace("/notifications");
      return;
    }
    setMode(routeReportId || routeMode === "report" || routeMode === "reports" ? "reports" : "nearby");
    setShowReportForm((routeMode === "report" || Boolean(routePetId)) && !routeReportId);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [routeMode, routePetId, routeReportId, router]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadCore(() => active).catch(cause => {
      if (active) setCoreError(authErrorMessage(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadCore]));

  const loadNearby = useCallback(async (coordinates: Coordinates) => {
    try {
      const rows = await getNearbyLostReports(coordinates.latitude, coordinates.longitude, 10);
      setNearby(rows);
      setNearbyError("");
    } catch (cause) {
      setNearbyError(authErrorMessage(cause));
    }
  }, []);

  async function useGps(loadFeed = false) {
    setLoadingLocation(true);
    setError("");
    if (loadFeed) setNearbyError("");
    try {
      const next = await requestCurrentCoordinates();
      if (loadFeed) {
        setLocation(next);
        await loadNearby(next);
      } else {
        setReportLocation(next);
      }
      return next;
    } catch (cause) {
      if (loadFeed) setNearbyError(authErrorMessage(cause));
      else setError(authErrorMessage(cause));
      return null;
    } finally {
      setLoadingLocation(false);
    }
  }

  function closeReport(nextMode = mode) {
    setShowReportForm(false);
    setMode(nextMode);
    setError("");
    router.setParams({ mode: nextMode === "reports" ? "reports" : "feed", petId: undefined, reportId: undefined });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function publish() {
    if (publishing) return;
    if (!selectedPetId) {
      setError(pets.length ? "Choose the pet you want to report lost." : "Add a pet before publishing a lost report.");
      return;
    }
    if (!lastSeenText.trim()) {
      setError("Describe where your pet was last seen.");
      return;
    }
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const pin = reportLocation || await useGps();
      if (!pin) return;
      const report = await createLostReport({
        petId: selectedPetId, lastSeenText, details,
        latitude: pin.latitude, longitude: pin.longitude, accuracyM: pin.accuracyM,
      });
      setLastSeenText("");
      setDetails("");
      setReportLocation(null);
      closeReport("reports");
      setMessage(report.petName + " is now in Recovery. Follow finder sightings in My Reports.");
      // Publication succeeded even if a subsequent refresh temporarily fails.
      await loadCore().catch(cause => setCoreError(authErrorMessage(cause)));
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPublishing(false);
    }
  }

  async function reunite(report: LostReport) {
    if (reuniting) return;
    setReuniting(report.id);
    setError("");
    try {
      await markPetReunited(report.id);
      setMessage(report.petName + " has been marked Reunited.");
      await loadCore();
      if (location) await loadNearby(location);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setReuniting("");
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await loadCore();
      if (!showReportForm && mode === "nearby" && location) await loadNearby(location);
    } catch (cause) {
      setCoreError(authErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  const activeCases = reports.filter(r => r.status !== "REUNITED")
    .sort((a, b) => Number(b.id === routeReportId) - Number(a.id === routeReportId));
  const reunitedCases = reports.filter(r => r.status === "REUNITED");
  const reporting = showReportForm && pets.length > 0 && !coreError;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={<RefreshControl accessibilityLabel="Refresh recovery" refreshing={refreshing} onRefresh={() => void refresh()} />}
          >
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                {showReportForm ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Back to Recovery" disabled={publishing} onPress={() => closeReport()} style={styles.iconButton}>
                    <BackArrow />
                  </Pressable>
                ) : null}
                <Text style={styles.screenTitle}>{showReportForm ? "Report Lost Pet" : "Recovery"}</Text>
              </View>
              {!showReportForm ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={styles.iconButton}>
                  <BellIcon />
                  {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
                </Pressable>
              ) : null}
            </View>

            {!showReportForm ? (
              <>
                <View style={styles.segment}>
                  {(["nearby", "reports"] as Mode[]).map(key => (
                    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: mode === key }} onPress={() => {
                      setMode(key);
                      setError("");
                      if (key === "nearby" && location) void loadNearby(location);
                      router.setParams({ mode: key === "nearby" ? "feed" : "reports", petId: undefined, reportId: undefined });
                    }} style={[styles.segmentItem, mode === key && styles.segmentItemActive]}>
                      <Text style={[styles.segmentLabel, mode === key && styles.segmentLabelActive]}>{key === "nearby" ? "Nearby" : "My Reports"}</Text>
                    </Pressable>
                  ))}
                </View>
                {!loading && !coreError && pets.length > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Report Lost Pet" onPress={() => {
                    setShowReportForm(true); setMessage(""); setError("");
                    scrollRef.current?.scrollTo({ y: 0, animated: false });
                  }} style={styles.reportCta}>
                    <PinIcon size={18} />
                    <Text style={styles.reportCtaText}>Report Lost Pet</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {coreError ? (
              <View style={styles.section}>
                <Text accessibilityRole="alert" style={styles.error}>{coreError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry recovery" onPress={() => void refresh()} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {loading ? <ActivityIndicator color={Palette.forestDark} style={styles.loader} /> : null}

            {!loading && reporting ? (
              <View style={styles.form}>
                <Text style={styles.sectionStep}>1. Pet</Text>
                <View style={styles.petChoices}>
                  {pets.map(pet => (
                    <Pressable key={pet.id} accessibilityRole="button" accessibilityLabel={"Select " + pet.name + " for lost report"}
                      accessibilityState={{ selected: selectedPetId === pet.id }} disabled={publishing}
                      onPress={() => setSelectedPetId(pet.id)} style={[styles.petChoice, selectedPetId === pet.id && styles.petChoiceActive]}>
                      <PawIcon size={17} /><Text style={styles.petChoiceText}>{pet.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.sectionStep}>2. Last seen</Text>
                <TextInput accessibilityLabel="Last seen" value={lastSeenText} onChangeText={setLastSeenText} editable={!publishing}
                  placeholder="e.g. Freedom Park, Tagum" placeholderTextColor={Palette.placeholder} style={styles.input} />

                <Text style={styles.sectionStep}>3. Location</Text>
                <Text style={styles.helper}>Use GPS or tap the map at the last known place.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={reportLocation ? "Refresh my GPS" : "Use my GPS"}
                  accessibilityState={{ disabled: loadingLocation || publishing }} disabled={loadingLocation || publishing}
                  onPress={() => void useGps()} style={styles.gpsButton}>
                  {loadingLocation ? <ActivityIndicator color={Palette.forestDark} /> : <><PinIcon size={19} /><Text style={styles.gpsText}>{reportLocation ? "Refresh my GPS" : "Use my GPS"}</Text></>}
                </Pressable>
                <RecoveryMap selected={reportLocation} pins={[]} onSelect={publishing ? undefined : coordinate => setReportLocation({ ...coordinate, accuracyM: null })} height={230} />
                {reportLocation ? <Text style={styles.helper}>Pin: {reportLocation.latitude.toFixed(5)}, {reportLocation.longitude.toFixed(5)}{reportLocation.accuracyM ? " · ±" + Math.round(reportLocation.accuracyM) + " m" : ""}</Text> : null}
                <Text style={styles.publicWarning}>This location becomes public while the report is active. Choose the last known area you are comfortable sharing.</Text>

                <Text style={styles.sectionStep}>4. Extra details</Text>
                <TextInput accessibilityLabel="Lost pet details" value={details} onChangeText={setDetails} editable={!publishing}
                  placeholder="Collar, behavior, direction of travel…" placeholderTextColor={Palette.placeholder}
                  multiline style={[styles.input, styles.textArea]} />
                <Text style={styles.sectionStep}>5. Publish</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Publish lost report"
                  accessibilityState={{ disabled: publishing || loadingLocation, busy: publishing }}
                  disabled={publishing || loadingLocation} onPress={() => void publish()} style={[styles.publishButton, publishing && styles.disabled]}>
                  {publishing ? <ActivityIndicator color={Palette.forestDark} /> : <><SendIcon /><Text style={styles.publishText}>Publish lost report</Text></>}
                </Pressable>
              </View>
            ) : null}

            {!loading && !coreError && showReportForm && pets.length === 0 ? (
              <View style={styles.emptyCard}>
                <PawIcon size={26} /><Text style={styles.emptyTitle}>Add a pet first</Text>
                <Text style={styles.helper}>Create a Pet ID before starting a lost report.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Add a pet" onPress={() => router.push("/add-pet")} style={styles.reportCta}>
                  <Text style={styles.reportCtaText}>Add a pet</Text>
                </Pressable>
              </View>
            ) : null}

            {!loading && !showReportForm && mode === "nearby" ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Within 10 km</Text>
                    <Text style={styles.helper}>Lost pets and recent sightings near you.</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Use my location" accessibilityState={{ disabled: loadingLocation }} disabled={loadingLocation}
                    onPress={() => void useGps(true)} style={styles.smallButton}>
                    {loadingLocation ? <ActivityIndicator color={Palette.forestDark} size="small" /> : <><PinIcon size={16} /><Text style={styles.smallButtonText}>{location ? "Refresh" : "Locate"}</Text></>}
                  </Pressable>
                </View>
                {nearbyError ? <Text accessibilityRole="alert" style={styles.error}>{nearbyError}</Text> : null}
                {location ? (
                  <RecoveryMap pins={nearby.map(report => ({
                    id: report.id, latitude: report.latitude, longitude: report.longitude, title: report.petName,
                    description: statusLabel(report.status) + " · " + report.distanceKm.toFixed(1) + " km",
                    status: report.status,
                  }))} selected={nearby.length ? null : location} height={270} />
                ) : (
                  <View style={styles.emptyCard}><PinIcon size={24} /><Text style={styles.emptyTitle}>Location needed</Text><Text style={styles.helper}>Tap Locate to see cases around you.</Text></View>
                )}
                <View style={styles.feedList}>
                  {nearby.map(report => (
                    <View key={report.id} style={styles.feedCard}>
                      <View style={styles.feedTop}>
                        <View style={styles.feedIdentity}>
                          <View style={styles.feedPhoto}><PawIcon size={24} /></View>
                          <View style={{ flex: 1 }}><Text style={styles.caseName}>{report.petName}</Text><Text style={styles.caseMeta}>{report.petBreed || report.petSpecies}</Text></View>
                        </View>
                        <View style={[styles.statusPill, report.status === "SIGHTED" && styles.statusSighted]}><Text style={styles.statusText}>{statusLabel(report.status).toUpperCase()}</Text></View>
                      </View>
                      <Text style={styles.caseLocation}>{report.lastSeenText} · {report.distanceKm.toFixed(1)} km away</Text>
                      {report.details ? <Text style={styles.feedDetails}>{report.details}</Text> : null}
                      <Text style={styles.helper}>{report.lastSightedAt ? "Latest sighting " + when(report.lastSightedAt) : "Reported " + when(report.reportedAt)}</Text>
                    </View>
                  ))}
                  {location && !loadingLocation && !nearbyError && nearby.length === 0 ? <View style={styles.emptyCard}><CheckIcon size={22} /><Text style={styles.emptyTitle}>No active cases nearby</Text><Text style={styles.helper}>No Lost or Sighted reports within 10 km.</Text></View> : null}
                </View>
              </View>
            ) : null}

            {!loading && !coreError && !showReportForm && mode === "reports" ? (
              <View style={styles.section}>
                {activeCases.length > 0 ? <Text style={styles.sectionTitle}>Active cases</Text> : (
                  <View style={styles.emptyCard}><CheckIcon size={22} /><Text style={styles.emptyTitle}>No active recovery cases</Text>
                    <Text style={styles.helper}>{pets.length ? "Start a report if a pet goes missing." : "Add a pet to create a Pet ID and report a loss."}</Text>
                    {pets.length === 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Add a pet" onPress={() => router.push("/add-pet")} style={styles.reportCta}><Text style={styles.reportCtaText}>Add a pet</Text></Pressable> : null}
                  </View>
                )}
                {activeCases.map(report => (
                  <View key={report.id} style={[styles.caseCard, report.id === routeReportId && styles.focusedCase]}>
                    <View style={styles.caseTop}>
                      <View style={styles.caseBody}><Text style={styles.caseName}>{report.petName}</Text><Text style={styles.caseMeta}>{report.sightingCount} {report.sightingCount === 1 ? "sighting" : "sightings"}</Text></View>
                      <View style={[styles.statusPill, report.status === "SIGHTED" && styles.statusSighted]}><Text style={styles.statusText}>{statusLabel(report.status).toUpperCase()}</Text></View>
                    </View>
                    <Text style={styles.caseLocation}>{report.lastSeenText}</Text>
                    {report.lastSightedAt ? <Text style={styles.helper}>Latest sighting: {when(report.lastSightedAt)}</Text> : null}
                      <View style={styles.caseMapBlock}>
                        <Text style={styles.caseMapTitle}>Recovery trail</Text>
                        <Text style={styles.helper}>
                          Original lost location plus finder-reported sightings.
                        </Text>
                        <RecoveryMap
                          pins={[
                            {
                              id: `${report.id}-lost`,
                              latitude: report.lastSeenLatitude,
                              longitude: report.lastSeenLongitude,
                              title: `${report.petName} · last seen`,
                              description: `Original lost report · ${report.lastSeenText}`,
                              status: "LOST",
                              kind: "lost",
                            },
                            ...orderedMapSightings(
                              sightingsByReport[report.id] || [],
                            ).map((sighting) => ({
                              id: sighting.id,
                              latitude: sighting.latitude!,
                              longitude: sighting.longitude!,
                              title:
                                sighting.encounterType === "HAVE_PET"
                                  ? "Finder reported having the pet"
                                  : "Finder sighting",
                              description: `${when(sighting.createdAt)}${
                                sighting.locationText
                                  ? ` · ${sighting.locationText}`
                                  : ""
                              }${
                                sighting.riskState === "REVIEW"
                                  ? " · Needs review"
                                  : ""
                              }`,
                              status: "SIGHTED" as const,
                              kind:
                                sighting.encounterType === "HAVE_PET"
                                  ? ("found" as const)
                                  : ("sighting" as const),
                            })),
                          ]}
                          trail={[
                            {
                              latitude: report.lastSeenLatitude,
                              longitude: report.lastSeenLongitude,
                            },
                            ...orderedMapSightings(
                              sightingsByReport[report.id] || [],
                            ).map((sighting) => ({
                              latitude: sighting.latitude!,
                              longitude: sighting.longitude!,
                            })),
                          ]}
                          selected={null}
                          height={230}
                        />
                        <Text style={styles.caseMapLegend}>
                          Green line: lost → first → latest · Red: last seen ·
                          Gold: sighting · Dark gold: finder has pet
                        </Text>
                      </View>

                    {failedDetails.includes(report.id) ? <Text accessibilityRole="alert" style={styles.error}>Finder sightings could not load. Pull to refresh and try again.</Text> : null}
                    {[...(sightingsByReport[report.id] || [])].filter(s => s.riskState !== "BLOCKED").sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(sighting => (
                      <Pressable key={sighting.id} accessibilityRole="button" accessibilityLabel={"Review " + report.petName + " sighting " + sighting.id}
                        onPress={() => router.push({ pathname: "/recovery-report", params: { reportId: report.id, sightingId: sighting.id } })} style={styles.sightingLink}>
                        <View style={styles.caseBody}>
                          <Text style={styles.sightingTitle}>{sighting.encounterType === "HAVE_PET" ? "Finder has pet" : "Finder sighting"}{sighting.riskState === "REVIEW" ? " · Needs review" : ""}</Text>
                          {sighting.locationText ? <Text style={styles.helper}>{sighting.locationText}</Text> : null}
                          <Text style={styles.helper}>{when(sighting.createdAt)}</Text>
                        </View><ChevronRightIcon size={18} />
                      </Pressable>
                    ))}
                    <Pressable accessibilityRole="button" accessibilityLabel={"Mark " + report.petName + " Reunited"}
                      accessibilityState={{ disabled: Boolean(reuniting), busy: reuniting === report.id }} disabled={Boolean(reuniting)}
                      onPress={() => void reunite(report)} style={[styles.reuniteButton, reuniting && styles.disabled]}>
                      {reuniting === report.id ? <ActivityIndicator color={Palette.white} /> : <><CheckIcon size={15} color={Palette.white} /><Text style={styles.reuniteText}>Mark Reunited</Text></>}
                    </Pressable>
                  </View>
                ))}
                {reunitedCases.length > 0 ? <Text style={styles.sectionTitle}>Reunited</Text> : null}
                {reunitedCases.map(report => (
                  <View key={report.id} style={[styles.caseCard, report.id === routeReportId && styles.focusedCase]}>
                    <View style={styles.caseTop}><View style={styles.caseBody}><Text style={styles.caseName}>{report.petName}</Text><Text style={styles.caseMeta}>{report.sightingCount} sightings</Text></View><View style={[styles.statusPill, styles.statusSighted]}><Text style={styles.statusText}>REUNITED</Text></View></View>
                    <Text style={styles.caseLocation}>{report.lastSeenText}</Text>
                    {report.reunitedAt ? <Text style={styles.helper}>{when(report.reunitedAt)}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        {!showReportForm ? <BottomNav active="recovery" /> : null}
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
  topBar: {
    minHeight: 48,
    gap: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  screenTitle: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: "800",
    color: Palette.forestDark,
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
    minHeight: 44,
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
  caseMapBlock: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  caseMapTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  caseMapLegend: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    lineHeight: 15,
    color: Palette.inkMuted,
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
    minHeight: 44,
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
    minHeight: 44,
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
    marginTop: Spacing.three,
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
    textAlign: "center",
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.three },
  reportCta: { marginTop: Spacing.three, minHeight: 48, borderRadius: 14, backgroundColor: Palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two },
  reportCtaText: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: "800", color: Palette.forestDark },
  form: { marginTop: Spacing.four, gap: Spacing.three },
  sectionStep: { marginTop: Spacing.two, fontFamily: Fonts.sans, fontSize: 15, fontWeight: "800", color: Palette.forestDark },
  caseBody: { flex: 1 },
  focusedCase: { borderColor: Palette.forestDark, borderWidth: 2 },
  sightingLink: { minHeight: 48, borderTopWidth: 1, borderTopColor: Palette.borderSoft, paddingVertical: Spacing.three, flexDirection: "row", alignItems: "center", gap: Spacing.two },
  sightingTitle: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: "700", color: Palette.forestDark },
  disabled: { opacity: 0.55 },
});