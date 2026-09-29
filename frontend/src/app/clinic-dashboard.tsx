import { Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CalendarIcon,
  CheckIcon,
  HealthIcon,
  LogoutIcon,
  QrIcon,
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage, useAuth } from "@/services/auth-context";
import {
  getClinic,
  listClinicAppointments,
  updateClinicAppointment,
} from "@/services/health-clinic";
import type { Appointment, ClinicSummary } from "../../../shared/contracts";

function appointmentTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function ClinicDashboard() {
  const router = useRouter();
  const { state, signOut } = useAuth();
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [clinicRow, rows] = await Promise.all([
      getClinic(),
      listClinicAppointments(),
    ]);
    setClinic(clinicRow);
    setAppointments(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
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
    }, [load]),
  );

  if (state.status !== "ready" || state.session.role !== "CLINIC") return null;

  async function update(
    appointment: Appointment,
    status: Appointment["status"],
  ) {
    setBusyId(appointment.id);
    setError("");
    try {
      await updateClinicAppointment(appointment.id, { status });
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusyId("");
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await signOut();
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  }

  const requested = appointments.filter((item) => item.status === "REQUESTED");
  const scheduled = appointments.filter((item) => item.status === "SCHEDULED");

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandIcon}>
              <HealthIcon size={25} color={Palette.forestDark} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleLogout()}
              style={styles.iconButton}
            >
              <LogoutIcon />
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>PETCONNECT · CLINIC</Text>
          <Text style={styles.title}>
            {clinic?.name || state.session.displayName}
          </Text>
          <Text style={styles.subtitle}>
            {clinic?.address || "Clinic workspace"}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/clinic-scan" as Href)}
            style={styles.scanButton}
          >
            <QrIcon size={22} color={Palette.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan patient Pet ID</Text>
              <Text style={styles.scanMeta}>
                Open a token-scoped patient chart, vaccinations, and scheduling.
              </Text>
            </View>
          </Pressable>

          <View style={styles.metrics}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{requested.length}</Text>
              <Text style={styles.metricLabel}>Requests</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{scheduled.length}</Text>
              <Text style={styles.metricLabel}>Scheduled</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{appointments.length}</Text>
              <Text style={styles.metricLabel}>Total</Text>
            </View>
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.sectionHeader}>
            <CalendarIcon size={20} />
            <Text style={styles.sectionTitle}>Appointment queue</Text>
          </View>

          {loading ? (
            <ActivityIndicator
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : appointments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No appointments yet</Text>
              <Text style={styles.meta}>
                Owner requests and clinic-created appointments will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {appointments.map((appointment) => {
                const busy = busyId === appointment.id;
                return (
                  <View key={appointment.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.petName}>
                          {appointment.petName}
                        </Text>
                        <Text style={styles.meta}>
                          {appointment.ownerName}
                          {appointment.ownerPhone
                            ? " · " + appointment.ownerPhone
                            : ""}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.status,
                          appointment.status === "REQUESTED"
                            ? styles.statusRequested
                            : appointment.status === "SCHEDULED"
                              ? styles.statusScheduled
                              : styles.statusMuted,
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {appointment.status}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.time}>
                      {appointmentTime(appointment.appointmentDate)}
                    </Text>
                    {appointment.reason ? (
                      <Text style={styles.reason}>{appointment.reason}</Text>
                    ) : null}

                    {busy ? (
                      <ActivityIndicator
                        color={Palette.forestDark}
                        style={styles.actionLoader}
                      />
                    ) : appointment.status === "REQUESTED" ? (
                      <View style={styles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void update(appointment, "SCHEDULED")}
                          style={[styles.actionButton, styles.primaryAction]}
                        >
                          <CheckIcon size={15} color={Palette.white} />
                          <Text style={styles.primaryActionText}>Confirm</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void update(appointment, "CANCELLED")}
                          style={styles.actionButton}
                        >
                          <Text style={styles.actionText}>Decline</Text>
                        </Pressable>
                      </View>
                    ) : appointment.status === "SCHEDULED" ? (
                      <View style={styles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void update(appointment, "COMPLETED")}
                          style={[styles.actionButton, styles.primaryAction]}
                        >
                          <CheckIcon size={15} color={Palette.white} />
                          <Text style={styles.primaryActionText}>Complete</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void update(appointment, "CANCELLED")}
                          style={styles.actionButton}
                        >
                          <Text style={styles.actionText}>Cancel</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
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
    padding: Spacing.four,
    paddingBottom: Spacing.five,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    marginTop: Spacing.four,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  title: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  subtitle: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
  },
  scanButton: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    gap: Spacing.three,
    alignItems: "center",
  },
  scanTitle: {
    fontFamily: Fonts.sans,
    color: Palette.white,
    fontSize: 16,
    fontWeight: "800",
  },
  scanMeta: {
    marginTop: 3,
    fontFamily: Fonts.sans,
    color: "#DDE9E1",
    fontSize: 11.5,
    lineHeight: 16,
  },
  metrics: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  metricCard: {
    flex: 1,
    padding: Spacing.three,
    backgroundColor: Palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  metricValue: {
    fontFamily: Fonts.sans,
    color: Palette.forestDark,
    fontSize: 22,
    fontWeight: "900",
  },
  metricLabel: {
    fontFamily: Fonts.sans,
    color: Palette.inkMuted,
    fontSize: 11,
    marginTop: 2,
  },
  error: {
    marginTop: Spacing.three,
    color: Palette.danger,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  sectionHeader: {
    marginTop: Spacing.five,
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
  loader: { marginTop: Spacing.four },
  list: { gap: Spacing.three, marginTop: Spacing.three },
  card: {
    padding: Spacing.three,
    backgroundColor: Palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  cardTop: {
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  meta: {
    marginTop: 2,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  status: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusRequested: { backgroundColor: Palette.goldSoft },
  statusScheduled: { backgroundColor: Palette.sage },
  statusMuted: { backgroundColor: Palette.segmentTrack },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  time: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  reason: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  actionButton: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  primaryAction: {
    backgroundColor: Palette.forestDark,
    borderColor: Palette.forestDark,
  },
  actionText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  primaryActionText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.white,
  },
  actionLoader: { marginTop: Spacing.three },
  emptyCard: {
    marginTop: Spacing.three,
    padding: Spacing.four,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    color: Palette.forestDark,
    fontSize: 15,
    fontWeight: "800",
  },
});
