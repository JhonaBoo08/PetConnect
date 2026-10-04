import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
} from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { authErrorMessage } from "@/services/auth-context";
import {
  createClinicAppointment,
  createClinicHealthRecord,
  createClinicVaccination,
  getClinicPatient,
} from "@/services/health-clinic";
import type {
  ClinicPatient,
  HealthRecordType,
} from "../../../shared/contracts";

type Mode = "history" | "record" | "vaccine" | "appointment";

const recordTypes: HealthRecordType[] = [
  "CHECKUP",
  "MEDICATION",
  "LAB",
  "PROCEDURE",
  "OTHER",
];

function futureIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

export default function ClinicPatientScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [patient, setPatient] = useState<ClinicPatient | null>(null);
  const [mode, setMode] = useState<Mode>("history");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [recordType, setRecordType] = useState<HealthRecordType>("CHECKUP");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordNotes, setRecordNotes] = useState("");

  const [vaccineName, setVaccineName] = useState("");
  const [doseNumber, setDoseNumber] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [vaccineNotes, setVaccineNotes] = useState("");
  const [nextDoseDays, setNextDoseDays] = useState(365);

  const [appointmentReason, setAppointmentReason] = useState("");
  const [appointmentDays, setAppointmentDays] = useState(3);

  const load = useCallback(async () => {
    if (!token) throw new Error("Missing PetConnect patient token.");
    setPatient(await getClinicPatient(token));
  }, [token]);

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

  async function saveRecord() {
    if (!token) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createClinicHealthRecord(token, {
        recordType,
        title: recordTitle,
        notes: recordNotes,
        occurredAt: new Date().toISOString(),
      });
      setRecordTitle("");
      setRecordNotes("");
      setMessage("Health record added.");
      setMode("history");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveVaccination() {
    if (!token) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createClinicVaccination(token, {
        vaccineName,
        doseNumber,
        lotNumber,
        notes: vaccineNotes,
        administeredAt: new Date().toISOString(),
        nextDueAt: nextDoseDays > 0 ? futureIso(nextDoseDays) : undefined,
      });
      setVaccineName("");
      setDoseNumber("");
      setLotNumber("");
      setVaccineNotes("");
      setMessage(
        nextDoseDays > 0
          ? "Vaccination saved and the owner’s booster reminder was scheduled."
          : "Vaccination saved.",
      );
      setMode("history");
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveAppointment() {
    if (!token) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createClinicAppointment(token, {
        appointmentDate: futureIso(appointmentDays),
        reason: appointmentReason,
        reminderMinutesBefore: 1440,
      });
      setAppointmentReason("");
      setMessage("Appointment scheduled and a 24-hour reminder was created.");
      setMode("history");
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
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to clinic"
            onPress={() => goBack("/clinic-dashboard")}
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
          ) : patient ? (
            <>
              <View style={styles.patientCard}>
                <View style={styles.petIcon}>
                  <PawIcon size={34} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.petName}>{patient.pet.name}</Text>
                  <Text style={styles.meta}>
                    {patient.pet.breed || patient.pet.species}
                    {patient.pet.ageLabel ? " · " + patient.pet.ageLabel : ""}
                  </Text>
                  <Text style={styles.owner}>
                    Owner: {patient.owner.displayName}
                    {patient.owner.phone ? " · " + patient.owner.phone : ""}
                  </Text>
                </View>
              </View>

              <View style={styles.segment}>
                {(patient.clinicalAccessGranted
                  ? (["history", "record", "vaccine", "appointment"] as Mode[])
                  : (["history"] as Mode[])
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
                      {item === "history"
                        ? "History"
                        : item === "record"
                          ? "Record"
                          : item === "vaccine"
                            ? "Vaccine"
                            : "Visit"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {message ? <Text style={styles.success}>{message}</Text> : null}
              {!patient.clinicalHistoryGranted ? (
                <Text style={styles.accessNotice}>
                  This recovery QR identifies the pet, but it does not grant
                  access to veterinary history or clinical changes. Ask the
                  owner to request an appointment with this clinic first.
                </Text>
              ) : !patient.clinicalAccessGranted ? (
                <Text style={styles.accessNotice}>
                  This clinic can view the pet's existing clinical history from
                  its established relationship. New records, vaccinations, or
                  clinic-created appointments require a new active
                  owner-requested appointment.
                </Text>
              ) : null}
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}

              {mode === "history" ? (
                <>
                  <View style={styles.sectionHeader}>
                    <HealthIcon size={20} />
                    <Text style={styles.sectionTitle}>Clinical history</Text>
                  </View>
                  {patient.recentHealthRecords.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyTitle}>
                        {patient.clinicalHistoryGranted
                          ? "No health records yet"
                          : "Clinical history locked"}
                      </Text>
                      <Text style={styles.meta}>
                        {patient.clinicalHistoryGranted
                          ? "Use Record or Vaccine to add the first clinic entry."
                          : "An active owner-requested appointment is required before this clinic can view health history."}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.list}>
                      {patient.recentHealthRecords.map((record) => (
                        <View key={record.id} style={styles.card}>
                          <View style={styles.cardTop}>
                            <Text style={styles.cardTitle}>{record.title}</Text>
                            <Text style={styles.typeBadge}>
                              {record.recordType}
                            </Text>
                          </View>
                          <Text style={styles.meta}>
                            {new Date(record.occurredAt).toLocaleString()} ·{" "}
                            {record.clinic.name}
                          </Text>
                          {record.notes ? (
                            <Text style={styles.notes}>{record.notes}</Text>
                          ) : null}
                          {record.vaccineName ? (
                            <Text style={styles.vaccineLine}>
                              {record.vaccineName}
                              {record.doseNumber
                                ? " · dose " + record.doseNumber
                                : ""}
                              {record.nextDueAt
                                ? " · next " +
                                  new Date(
                                    record.nextDueAt,
                                  ).toLocaleDateString()
                                : ""}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.sectionHeader}>
                    <CalendarIcon size={20} />
                    <Text style={styles.sectionTitle}>This clinic</Text>
                  </View>
                  {patient.upcomingAppointments.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyTitle}>No active visits</Text>
                    </View>
                  ) : (
                    <View style={styles.list}>
                      {patient.upcomingAppointments.map((appointment) => (
                        <View key={appointment.id} style={styles.card}>
                          <Text style={styles.cardTitle}>
                            {new Date(
                              appointment.appointmentDate,
                            ).toLocaleString()}
                          </Text>
                          <Text style={styles.meta}>
                            {appointment.status}
                            {appointment.reason
                              ? " · " + appointment.reason
                              : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : null}

              {mode === "record" ? (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>Add health record</Text>
                  <View style={styles.choiceRow}>
                    {recordTypes.map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => setRecordType(type)}
                        style={[
                          styles.choice,
                          recordType === type && styles.choiceActive,
                        ]}
                      >
                        <Text style={styles.choiceText}>{type}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={recordTitle}
                    onChangeText={setRecordTitle}
                    placeholder="Record title"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                  <TextInput
                    value={recordNotes}
                    onChangeText={setRecordNotes}
                    placeholder="Clinical notes"
                    placeholderTextColor={Palette.placeholder}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />
                  <Pressable
                    disabled={saving}
                    onPress={() => void saveRecord()}
                    style={styles.primaryButton}
                  >
                    {saving ? (
                      <ActivityIndicator color={Palette.white} />
                    ) : (
                      <Text style={styles.primaryText}>Save record</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {mode === "vaccine" ? (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>Record vaccination</Text>
                  <TextInput
                    value={vaccineName}
                    onChangeText={setVaccineName}
                    placeholder="Vaccine name"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                  <View style={styles.twoCols}>
                    <TextInput
                      value={doseNumber}
                      onChangeText={setDoseNumber}
                      placeholder="Dose"
                      placeholderTextColor={Palette.placeholder}
                      style={[styles.input, styles.flexInput]}
                    />
                    <TextInput
                      value={lotNumber}
                      onChangeText={setLotNumber}
                      placeholder="Lot number"
                      placeholderTextColor={Palette.placeholder}
                      style={[styles.input, styles.flexInput]}
                    />
                  </View>
                  <TextInput
                    value={vaccineNotes}
                    onChangeText={setVaccineNotes}
                    placeholder="Notes"
                    placeholderTextColor={Palette.placeholder}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />
                  <Text style={styles.label}>Next dose</Text>
                  <View style={styles.choiceRow}>
                    {[
                      { label: "30 days", value: 30 },
                      { label: "1 year", value: 365 },
                      { label: "None", value: 0 },
                    ].map((option) => (
                      <Pressable
                        key={option.label}
                        onPress={() => setNextDoseDays(option.value)}
                        style={[
                          styles.choice,
                          nextDoseDays === option.value && styles.choiceActive,
                        ]}
                      >
                        <Text style={styles.choiceText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    disabled={saving}
                    onPress={() => void saveVaccination()}
                    style={styles.primaryButton}
                  >
                    {saving ? (
                      <ActivityIndicator color={Palette.white} />
                    ) : (
                      <>
                        <CheckIcon size={15} color={Palette.white} />
                        <Text style={styles.primaryText}>Save vaccination</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {mode === "appointment" ? (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>Schedule clinic visit</Text>
                  <TextInput
                    value={appointmentReason}
                    onChangeText={setAppointmentReason}
                    placeholder="Reason for visit"
                    placeholderTextColor={Palette.placeholder}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />
                  <Text style={styles.label}>Appointment date</Text>
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
                    {new Date(futureIso(appointmentDays)).toLocaleString()} ·
                    owner notified 24 hours before
                  </Text>
                  <Pressable
                    disabled={saving}
                    onPress={() => void saveAppointment()}
                    style={styles.primaryButton}
                  >
                    {saving ? (
                      <ActivityIndicator color={Palette.white} />
                    ) : (
                      <Text style={styles.primaryText}>Schedule visit</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Patient unavailable</Text>
              <Text style={styles.meta}>
                The QR may have been rotated, disabled, or the patient no longer
                exists.
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
  patientCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    gap: Spacing.three,
    alignItems: "center",
  },
  petIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  petName: {
    fontFamily: Fonts.sans,
    color: Palette.white,
    fontSize: 22,
    fontWeight: "800",
  },
  owner: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    color: Palette.sage,
    fontSize: 11.5,
  },
  segment: {
    flexDirection: "row",
    marginTop: Spacing.three,
    padding: 4,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
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
  segmentTextActive: { color: Palette.forestDark, fontWeight: "800" },
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
  accessNotice: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: Palette.goldSoft,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.forestDark,
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
  list: { gap: Spacing.two, marginTop: Spacing.two },
  card: {
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
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
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.forestDark,
  },
  vaccineLine: {
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  empty: {
    marginTop: Spacing.three,
    padding: Spacing.four,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  formCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    gap: Spacing.two,
  },
  formTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
    marginBottom: Spacing.one,
  },
  label: {
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    color: Palette.forestDark,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  textArea: {
    minHeight: 90,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  twoCols: { flexDirection: "row", gap: Spacing.two },
  flexInput: { flex: 1 },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  choice: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceActive: {
    backgroundColor: Palette.sage,
    borderColor: Palette.forestDark,
  },
  choiceText: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  preview: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  primaryButton: {
    minHeight: 46,
    marginTop: Spacing.one,
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
});
