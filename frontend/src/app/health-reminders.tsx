import {
  Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
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
  CalendarIcon,
  CheckIcon,
  HealthIcon,
  PawIcon,
  PlusIcon,
} from "@/components/app-icons";
import { BottomNav } from "@/components/bottom-nav";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  cancelAppointment,
  createAppointment,
  createHealthReminder,
  listAppointments,
  listClinics,
  listHealthRecords,
  listHealthReminders,
} from "@/services/health-clinic";
import { listPets } from "@/services/pets";
import type {
  Appointment,
  ClinicSummary,
  HealthRecord,
  HealthReminder,
  Pet,
} from "../../../shared/contracts";

type Mode = "reminders" | "records" | "appointments" | "clinics";

function futureIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function statusTone(status: Appointment["status"]) {
  return status === "REQUESTED"
    ? styles.statusRequested
    : status === "SCHEDULED"
      ? styles.statusScheduled
      : styles.statusMuted;
}

export default function HealthRemindersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ petId?: string }>();
  const routePetId = Array.isArray(params.petId)
    ? params.petId[0]
    : params.petId;
  const [mode, setMode] = useState<Mode>("reminders");
  const [pets, setPets] = useState<Pet[]>([]);
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [reminders, setReminders] = useState<HealthReminder[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedPetId, setSelectedPetId] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");
  const [reminderDays, setReminderDays] = useState(7);

  const [selectedClinicId, setSelectedClinicId] = useState("");
  const [appointmentReason, setAppointmentReason] = useState("");
  const [appointmentDays, setAppointmentDays] = useState(3);

  const load = useCallback(async () => {
    const [petRows, clinicRows, recordRows, reminderRows, appointmentRows] =
      await Promise.all([
        listPets(),
        listClinics(),
        listHealthRecords(),
        listHealthReminders(),
        listAppointments(),
      ]);
    setPets(petRows);
    setClinics(clinicRows);
    setRecords(recordRows);
    setReminders(reminderRows);
    setAppointments(appointmentRows);
    setSelectedPetId((current) => {
      if (routePetId && petRows.some((pet) => pet.id === routePetId))
        return routePetId;
      if (current && petRows.some((pet) => pet.id === current)) return current;
      return petRows.length === 1 ? petRows[0].id : "";
    });
    setSelectedClinicId((current) => {
      if (current && clinicRows.some((clinic) => clinic.id === current))
        return current;
      return clinicRows.length === 1 ? clinicRows[0].id : "";
    });
  }, [routePetId]);

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

  async function addReminder() {
    if (!selectedPetId) {
      setError(
        pets.length === 0
          ? "Add a pet before creating a health reminder."
          : "Choose a pet before creating a health reminder.",
      );
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createHealthReminder({
        petId: selectedPetId,
        title: reminderTitle,
        notes: reminderNotes,
        dueAt: futureIso(reminderDays),
      });
      setReminderTitle("");
      setReminderNotes("");
      setMessage("Reminder created and notification delivery scheduled.");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function requestAppointment() {
    if (!selectedPetId || !selectedClinicId) {
      setError("Choose a pet and clinic first.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createAppointment({
        petId: selectedPetId,
        clinicId: selectedClinicId,
        appointmentDate: futureIso(appointmentDays),
        reason: appointmentReason,
        reminderMinutesBefore: 1440,
      });
      setAppointmentReason("");
      setMessage("Appointment request sent to the clinic.");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(appointment: Appointment) {
    setSaving(true);
    setError("");
    try {
      await cancelAppointment(appointment.id);
      setMessage("Appointment cancelled.");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => goBack("/dashboard")}
            style={styles.backButton}
          >
            <BackArrow />
          </Pressable>

          <Text style={styles.eyebrow}>PET HEALTH</Text>
          <Text style={styles.heading}>Health & clinic hub</Text>
          <Text style={styles.supporting}>
            Your pet&apos;s clinic history, reminders, vaccinations, and visits
            stay together in PetConnect.
          </Text>

          <View style={styles.segment}>
            {(
              ["reminders", "records", "appointments", "clinics"] as Mode[]
            ).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === item }}
                onPress={() => {
                  setMode(item);
                  setError("");
                  setMessage("");
                }}
                style={[
                  styles.segmentItem,
                  mode === item && styles.segmentItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === item && styles.segmentTextActive,
                  ]}
                >
                  {item === "appointments"
                    ? "Visits"
                    : item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {loading ? (
            <ActivityIndicator
              color={Palette.forestDark}
              style={styles.loader}
            />
          ) : null}

          {!loading && mode === "reminders" ? (
            <>
              <View style={styles.formCard}>
                <View style={styles.formHeader}>
                  <PlusIcon />
                  <Text style={styles.formTitle}>New reminder</Text>
                </View>
                <Text style={styles.label}>Pet</Text>
                <View style={styles.choiceRow}>
                  {pets.map((pet) => (
                    <Pressable
                      key={pet.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${pet.name} for reminder`}
                      accessibilityState={{
                        selected: selectedPetId === pet.id,
                      }}
                      onPress={() => setSelectedPetId(pet.id)}
                      style={[
                        styles.choice,
                        selectedPetId === pet.id && styles.choiceActive,
                      ]}
                    >
                      <PawIcon size={15} />
                      <Text style={styles.choiceText}>{pet.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={reminderTitle}
                  onChangeText={setReminderTitle}
                  placeholder="e.g. Deworming, annual checkup"
                  placeholderTextColor={Palette.placeholder}
                  style={styles.input}
                />
                <TextInput
                  value={reminderNotes}
                  onChangeText={setReminderNotes}
                  placeholder="Notes"
                  placeholderTextColor={Palette.placeholder}
                  multiline
                  style={[styles.input, styles.textArea]}
                />
                <Text style={styles.label}>Due</Text>
                <View style={styles.choiceRow}>
                  {[
                    { label: "Tomorrow", days: 1 },
                    { label: "1 week", days: 7 },
                    { label: "1 month", days: 30 },
                  ].map((option) => (
                    <Pressable
                      key={option.days}
                      onPress={() => setReminderDays(option.days)}
                      style={[
                        styles.choice,
                        reminderDays === option.days && styles.choiceActive,
                      ]}
                    >
                      <Text style={styles.choiceText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  disabled={saving}
                  onPress={() => void addReminder()}
                  style={styles.primaryButton}
                >
                  {saving ? (
                    <ActivityIndicator color={Palette.white} />
                  ) : (
                    <Text style={styles.primaryText}>Create reminder</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <CalendarIcon size={20} />
                <Text style={styles.sectionTitle}>Your reminders</Text>
              </View>
              <View style={styles.list}>
                {reminders.map((reminder) => (
                  <Pressable
                    key={reminder.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/reminder-details",
                        params: { id: reminder.id },
                      } as unknown as Href)
                    }
                    style={styles.card}
                  >
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{reminder.title}</Text>
                        <Text style={styles.meta}>
                          {reminder.petName} ·{" "}
                          {new Date(reminder.dueAt).toLocaleString()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.status,
                          reminder.status === "PENDING"
                            ? styles.statusScheduled
                            : styles.statusMuted,
                        ]}
                      >
                        <Text style={styles.statusText}>{reminder.status}</Text>
                      </View>
                    </View>
                    {reminder.clinic ? (
                      <Text style={styles.clinicLine}>
                        From {reminder.clinic.name}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
                {reminders.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No reminders yet</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {!loading && mode === "records" ? (
            <>
              <View style={styles.sectionHeader}>
                <HealthIcon size={20} />
                <Text style={styles.sectionTitle}>Health history</Text>
              </View>
              <View style={styles.list}>
                {records.map((record) => (
                  <View key={record.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle}>{record.title}</Text>
                      <Text style={styles.typeBadge}>{record.recordType}</Text>
                    </View>
                    <Text style={styles.meta}>
                      {record.petName} ·{" "}
                      {new Date(record.occurredAt).toLocaleDateString()} ·{" "}
                      {record.clinic.name}
                    </Text>
                    {record.notes ? (
                      <Text style={styles.notes}>{record.notes}</Text>
                    ) : null}
                    {record.vaccineName ? (
                      <Text style={styles.clinicLine}>
                        {record.vaccineName}
                        {record.nextDueAt
                          ? " · next dose " +
                            new Date(record.nextDueAt).toLocaleDateString()
                          : ""}
                      </Text>
                    ) : null}
                  </View>
                ))}
                {records.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No clinic records yet</Text>
                    <Text style={styles.meta}>
                      A clinic can add records after scanning your active Pet
                      ID.
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {!loading && mode === "appointments" ? (
            <>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Request appointment</Text>
                <Text style={styles.label}>Pet</Text>
                <View style={styles.choiceRow}>
                  {pets.map((pet) => (
                    <Pressable
                      key={pet.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${pet.name} for appointment`}
                      accessibilityState={{
                        selected: selectedPetId === pet.id,
                      }}
                      onPress={() => setSelectedPetId(pet.id)}
                      style={[
                        styles.choice,
                        selectedPetId === pet.id && styles.choiceActive,
                      ]}
                    >
                      <Text style={styles.choiceText}>{pet.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Clinic</Text>
                <View style={styles.choiceRow}>
                  {clinics.map((clinic) => (
                    <Pressable
                      key={clinic.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${clinic.name} for appointment`}
                      accessibilityState={{
                        selected: selectedClinicId === clinic.id,
                      }}
                      onPress={() => setSelectedClinicId(clinic.id)}
                      style={[
                        styles.choice,
                        selectedClinicId === clinic.id && styles.choiceActive,
                      ]}
                    >
                      <Text style={styles.choiceText}>{clinic.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={appointmentReason}
                  onChangeText={setAppointmentReason}
                  placeholder="Reason for visit"
                  placeholderTextColor={Palette.placeholder}
                  multiline
                  style={[styles.input, styles.textArea]}
                />
                <Text style={styles.label}>Preferred date</Text>
                <View style={styles.choiceRow}>
                  {[1, 3, 7].map((days) => (
                    <Pressable
                      key={days}
                      onPress={() => setAppointmentDays(days)}
                      style={[
                        styles.choice,
                        appointmentDays === days && styles.choiceActive,
                      ]}
                    >
                      <Text style={styles.choiceText}>
                        {days === 1 ? "Tomorrow" : "+" + days + " days"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.preview}>
                  {new Date(futureIso(appointmentDays)).toLocaleString()}
                </Text>
                <Pressable
                  disabled={saving}
                  onPress={() => void requestAppointment()}
                  style={styles.primaryButton}
                >
                  {saving ? (
                    <ActivityIndicator color={Palette.white} />
                  ) : (
                    <Text style={styles.primaryText}>Send request</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <CalendarIcon size={20} />
                <Text style={styles.sectionTitle}>Appointments</Text>
              </View>
              <View style={styles.list}>
                {appointments.map((appointment) => (
                  <View key={appointment.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>
                          {appointment.clinic.name}
                        </Text>
                        <Text style={styles.meta}>
                          {appointment.petName} ·{" "}
                          {new Date(
                            appointment.appointmentDate,
                          ).toLocaleString()}
                        </Text>
                      </View>
                      <View
                        style={[styles.status, statusTone(appointment.status)]}
                      >
                        <Text style={styles.statusText}>
                          {appointment.status}
                        </Text>
                      </View>
                    </View>
                    {appointment.reason ? (
                      <Text style={styles.notes}>{appointment.reason}</Text>
                    ) : null}
                    {appointment.status === "REQUESTED" ||
                    appointment.status === "SCHEDULED" ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving}
                        onPress={() => void cancel(appointment)}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryText}>
                          Cancel appointment
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {appointments.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No appointments yet</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {!loading && mode === "clinics" ? (
            <>
              <View style={styles.sectionHeader}>
                <HealthIcon size={20} />
                <Text style={styles.sectionTitle}>Active clinics</Text>
              </View>
              <View style={styles.list}>
                {clinics.map((clinic) => (
                  <View key={clinic.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{clinic.name}</Text>
                    <Text style={styles.meta}>{clinic.address}</Text>
                    {clinic.phone ? (
                      <Text style={styles.clinicLine}>{clinic.phone}</Text>
                    ) : null}
                  </View>
                ))}
                {clinics.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>
                      No active clinics are available yet
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>

        <BottomNav active="home" />
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
  supporting: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
  },
  segment: {
    flexDirection: "row",
    marginTop: Spacing.four,
    padding: 4,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 14,
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentItemActive: { backgroundColor: Palette.sage },
  segmentText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "700",
    color: Palette.inkMuted,
  },
  segmentTextActive: {
    color: Palette.forestDark,
    fontWeight: "800",
  },
  success: {
    marginTop: Spacing.three,
    padding: Spacing.two,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.forestDark,
  },
  error: {
    marginTop: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
  },
  loader: { marginTop: Spacing.five },
  formCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    gap: Spacing.two,
  },
  formHeader: {
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
  },
  formTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  label: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  choice: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  choiceActive: {
    backgroundColor: Palette.sage,
    borderColor: Palette.forestDark,
  },
  choiceText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  input: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 80,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  primaryButton: {
    minHeight: 46,
    marginTop: Spacing.one,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.white,
  },
  preview: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
  },
  sectionHeader: {
    marginTop: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  list: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 15,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  cardTop: {
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
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
  notes: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.forestDark,
  },
  clinicLine: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  typeBadge: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: "800",
    color: Palette.forestDark,
    backgroundColor: Palette.sage,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  status: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  statusRequested: { backgroundColor: Palette.goldSoft },
  statusScheduled: { backgroundColor: Palette.sage },
  statusMuted: { backgroundColor: Palette.segmentTrack },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  secondaryButton: {
    marginTop: Spacing.three,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  emptyCard: {
    padding: Spacing.four,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
});
