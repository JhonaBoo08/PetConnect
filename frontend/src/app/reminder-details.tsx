import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  CalendarIcon,
  CheckIcon,
  HealthIcon,
  PawIcon,
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  deleteHealthReminder,
  getHealthReminder,
  updateHealthReminder,
} from "@/services/health-clinic";
import type { HealthReminder } from "../../../shared/contracts";

function rescheduleDates(days: number) {
  const due = new Date();
  due.setDate(due.getDate() + days);
  due.setHours(9, 0, 0, 0);
  const notify = new Date(
    Math.max(Date.now(), due.getTime() - 24 * 60 * 60 * 1000),
  );
  return { dueAt: due.toISOString(), notifyAt: notify.toISOString() };
}

export default function ReminderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [reminder, setReminder] = useState<HealthReminder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) throw new Error("Reminder ID is missing.");
    setReminder(await getHealthReminder(id));
  }, [id]);

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

  async function markCompleted() {
    if (!reminder) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateHealthReminder(reminder.id, {
        status: reminder.status === "COMPLETED" ? "PENDING" : "COMPLETED",
      });
      setReminder(updated);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function reschedule(days: number) {
    if (!reminder) return;
    setSaving(true);
    setError("");
    try {
      const dates = rescheduleDates(days);
      const updated = await updateHealthReminder(reminder.id, {
        ...dates,
        status: "PENDING",
      });
      setReminder(updated);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!reminder) return;
    setSaving(true);
    setError("");
    try {
      await deleteHealthReminder(reminder.id);
      router.replace("/health-reminders");
    } catch (cause) {
      setError(authErrorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to health hub"
            onPress={() => goBack("/health-reminders")}
            style={styles.backButton}
          >
            <BackArrow />
          </Pressable>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : reminder ? (
            <>
              <Text style={styles.eyebrow}>HEALTH REMINDER</Text>
              <Text style={styles.heading}>{reminder.title}</Text>

              <View style={styles.petLine}>
                <PawIcon size={18} />
                <Text style={styles.petName}>{reminder.petName}</Text>
              </View>

              <View style={styles.mainCard}>
                <View style={styles.icon}>
                  <CalendarIcon size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.date}>
                    {new Date(reminder.dueAt).toLocaleString()}
                  </Text>
                  <Text style={styles.meta}>
                    Notification: {new Date(reminder.notifyAt).toLocaleString()}
                  </Text>
                  <View
                    style={[
                      styles.status,
                      reminder.status === "PENDING"
                        ? styles.statusPending
                        : styles.statusDone,
                    ]}
                  >
                    <Text style={styles.statusText}>{reminder.status}</Text>
                  </View>
                </View>
              </View>

              {reminder.notes ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>NOTES</Text>
                  <Text style={styles.notes}>{reminder.notes}</Text>
                </View>
              ) : null}

              {reminder.clinic ? (
                <View style={styles.infoCard}>
                  <HealthIcon size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>FROM CLINIC</Text>
                    <Text style={styles.clinicName}>
                      {reminder.clinic.name}
                    </Text>
                    <Text style={styles.meta}>{reminder.clinic.address}</Text>
                  </View>
                </View>
              ) : null}

              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void markCompleted()}
                style={styles.primaryButton}
              >
                {saving ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <>
                    <CheckIcon size={16} color={Palette.white} />
                    <Text style={styles.primaryText}>
                      {reminder.status === "COMPLETED"
                        ? "Mark pending again"
                        : "Mark completed"}
                    </Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.sectionLabel}>Reschedule</Text>
              <View style={styles.actions}>
                {[1, 7, 30].map((days) => (
                  <Pressable
                    key={days}
                    disabled={saving}
                    onPress={() => void reschedule(days)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>
                      +{days} {days === 1 ? "day" : "days"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void remove()}
                style={styles.removeButton}
              >
                <Text style={styles.removeText}>Delete reminder</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.notes}>
                {error || "Reminder unavailable."}
              </Text>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  backButton: {
    marginTop: Spacing.two,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  loader: { marginTop: Spacing.six },
  eyebrow: {
    marginTop: Spacing.four,
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
    fontWeight: "800",
    color: Palette.forestDark,
  },
  petLine: {
    marginTop: Spacing.two,
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  mainCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    flexDirection: "row",
    gap: Spacing.three,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  date: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  meta: {
    marginTop: 3,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  status: {
    alignSelf: "flex-start",
    marginTop: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  statusPending: { backgroundColor: Palette.goldSoft },
  statusDone: { backgroundColor: Palette.sage },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  infoCard: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    flexDirection: "row",
    gap: Spacing.two,
  },
  infoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: Palette.inkMuted,
  },
  notes: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.forestDark,
  },
  clinicName: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  error: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
  },
  primaryButton: {
    marginTop: Spacing.four,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.white,
  },
  sectionLabel: {
    marginTop: Spacing.four,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  actions: {
    marginTop: Spacing.two,
    flexDirection: "row",
    gap: Spacing.two,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  removeButton: {
    marginTop: Spacing.four,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.danger,
  },
});
