import { useFonts } from "expo-font";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CheckIcon,
  ChevronRightIcon,
  PawIcon,
  PlusIcon,
} from "@/components/app-icons";
import { CareDateTimeFields } from "@/components/care-date-time-fields";
import { Fonts } from "@/constants/theme";
import {
  CARE_COLORS,
  buildCareItems,
  careDateTime,
  careDayLabel,
  careTime,
  dateFromKey,
  dateInputValue,
  defaultReminderTime,
  itemsByDay,
  localDateKey,
  monthDays,
  monthRange,
  scheduleIso,
  shiftMonth,
  statusLabel,
  type CareItem,
} from "@/lib/care-calendar";
import { authErrorMessage } from "@/services/auth-context";
import {
  createHealthReminder,
  listAppointments,
  listHealthReminders,
} from "@/services/health-clinic";
import { petPhotoUri } from "@/services/pets";
import type {
  Appointment,
  HealthReminder,
  Pet,
} from "../../../shared/contracts";

type Sheet = "closed" | "details" | "create";
export type CareCalendarHandle = { addReminder: () => void };
const weekdayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{children}</Text>
    </View>
  );
}

function CareItemDetails({
  item,
  color,
  onManage,
}: {
  item: CareItem;
  color: string;
  onManage: (id: string) => void;
}) {
  const appointment = item.kind === "appointment" ? item.appointment : null;
  const reminder = item.reminder;
  const clinic = appointment?.clinic || reminder?.clinic;
  const notes = appointment?.reason || reminder?.notes;
  const status = appointment?.status || reminder!.status;
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailTop}>
        <View style={[styles.petDot, { backgroundColor: color }]} />
        <Text style={styles.detailPet}>{item.petName}</Text>
        <Text style={styles.itemTime}>{careTime(item.at)}</Text>
      </View>
      <Text style={styles.detailTitle}>{item.title}</Text>
      <View style={styles.statusRow}>
        <Text style={styles.status}>{statusLabel(status)}</Text>
        <Text style={styles.source}>
          {appointment
            ? "Clinic appointment"
            : statusLabel(reminder!.sourceType) + " reminder"}
        </Text>
      </View>
      <Detail label="Scheduled">{careDateTime(item.at)}</Detail>
      {notes ? (
        <Detail label={appointment ? "Reason" : "Notes"}>{notes}</Detail>
      ) : null}
      {clinic ? (
        <>
          <Detail label="Clinic">{clinic.name}</Detail>
          <Detail label="Address">{clinic.address}</Detail>
          {clinic.phone ? <Detail label="Phone">{clinic.phone}</Detail> : null}
        </>
      ) : null}
      {appointment?.vetName ? (
        <Detail label="Veterinarian">{appointment.vetName}</Detail>
      ) : null}
      {appointment ? (
        <Detail label="Reminder">
          {appointment.reminderMinutesBefore === 0
            ? "At the appointment time"
            : appointment.reminderMinutesBefore + " minutes before"}
        </Detail>
      ) : null}
      {reminder ? (
        <Detail label="Notification">{careDateTime(reminder.notifyAt)}</Detail>
      ) : null}
      {reminder?.completedAt ? (
        <Detail label="Completed">{careDateTime(reminder.completedAt)}</Detail>
      ) : null}
      <Detail label="Created">
        {careDateTime(appointment?.createdAt || reminder!.createdAt)}
      </Detail>
      {appointment ? (
        <Detail label="Updated">{careDateTime(appointment.updatedAt)}</Detail>
      ) : null}
      {item.kind === "reminder" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onManage(item.reminder.id)}
          style={styles.manageButton}
        >
          <Text style={styles.manageText}>Manage reminder</Text>
          <ChevronRightIcon size={14} color="#214C36" />
        </Pressable>
      ) : null}
    </View>
  );
}

export const OwnerCareCalendar = forwardRef<
  CareCalendarHandle,
  { pets: Pet[]; loadingPets?: boolean }
>(function OwnerCareCalendar({ pets, loadingPets = false }, ref) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    CareSerif: require("../../assets/fonts/InstrumentSerif-Regular.ttf"),
  });
  const serif = fontsLoaded ? "CareSerif" : Fonts.serif;
  const today = localDateKey(new Date());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState(today);
  const [petFilter, setPetFilter] = useState("");
  const [reminders, setReminders] = useState<HealthReminder[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sheet, setSheet] = useState<Sheet>("closed");
  const [formPetId, setFormPetId] = useState("");
  const [choosePet, setChoosePet] = useState(false);
  const [title, setTitle] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("09:00 AM");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const focused = useRef(false);
  const revision = useRef(0);
  const monthKey = localDateKey(month);

  const load = useCallback(
    async (showLoading = false) => {
      const request = ++revision.current;
      if (showLoading) setLoading(true);
      try {
        const range = monthRange(dateFromKey(monthKey));
        const [reminderRows, appointmentRows] = await Promise.all([
          listHealthReminders(undefined, range),
          listAppointments(range),
        ]);
        if (!focused.current || request !== revision.current) return;
        setReminders(reminderRows);
        setAppointments(appointmentRows);
        setLoadError("");
      } catch (cause) {
        if (focused.current && request === revision.current)
          setLoadError(authErrorMessage(cause));
      } finally {
        if (focused.current && request === revision.current) setLoading(false);
      }
    },
    [monthKey],
  );

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load(true);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      const poll = setInterval(() => void load(), 60000);
      return () => {
        focused.current = false;
        revision.current++;
        subscription.remove();
        clearInterval(poll);
      };
    }, [load]),
  );

  useEffect(() => {
    if (petFilter && !pets.some((pet) => pet.id === petFilter))
      setPetFilter("");
  }, [pets, petFilter]);

  const colors = useMemo(
    () =>
      new Map(
        pets.map((pet, index) => [
          pet.id,
          CARE_COLORS[index % CARE_COLORS.length],
        ]),
      ),
    [pets],
  );
  const colorFor = (id: string) => colors.get(id) || CARE_COLORS[0];
  const items = useMemo(
    () => buildCareItems(reminders, appointments),
    [reminders, appointments],
  );
  const byDay = useMemo(() => itemsByDay(items, petFilter), [items, petFilter]);
  const dayItems = byDay.get(selectedDay) || [];
  const formPet = pets.find((pet) => pet.id === formPetId);
  const busy = loading || loadingPets;

  function openCreate(day: string) {
    if (!pets.length || busy) return;
    let date = dateFromKey(day);
    if (day < today) date = new Date();
    // A late-night reminder still starts with a future, valid local time.
    const next = new Date(Date.now() + 30 * 60 * 1000);
    if (localDateKey(date) === today && localDateKey(next) !== today)
      date = next;
    setFormPetId(petFilter || pets[0].id);
    setChoosePet(false);
    setTitle("");
    setDateValue(dateInputValue(localDateKey(date)));
    setTimeValue(defaultReminderTime(date));
    setSaveError("");
    setSheet("create");
  }

  function openDay(day: string) {
    if (busy) return;
    setSelectedDay(day);
    if ((byDay.get(day)?.length || 0) > 0 || day < today || !pets.length)
      setSheet("details");
    else openCreate(day);
  }

  function closeSheet() {
    if (!savingRef.current) setSheet("closed");
  }

  useImperativeHandle(ref, () => ({
    addReminder: () => openCreate(selectedDay),
  }));

  async function saveReminder() {
    if (savingRef.current) return;
    setSaveError("");
    let dueAt: string;
    try {
      if (!formPet) throw new Error("Choose a pet for this reminder.");
      if (!title.trim()) throw new Error("Enter a reminder.");
      if (title.trim().length > 120)
        throw new Error("Keep the reminder under 120 characters.");
      dueAt = scheduleIso(dateValue, timeValue);
    } catch (cause) {
      setSaveError(authErrorMessage(cause));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await createHealthReminder({
        petId: formPetId,
        title: title.trim(),
        dueAt,
      });
      if (!focused.current) return;
      revision.current++; // Do not let an older GET erase a newly confirmed reminder.
      setReminders((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      const day = localDateKey(new Date(saved.dueAt));
      setSelectedDay(day);
      setMonth(
        new Date(
          new Date(saved.dueAt).getFullYear(),
          new Date(saved.dueAt).getMonth(),
          1,
        ),
      );
      if (petFilter && petFilter !== saved.petId) setPetFilter(saved.petId);
      setSheet("details");
      // Refresh the actual backend data; the POST response is already persisted.
      void load();
    } catch (cause) {
      if (focused.current) setSaveError(authErrorMessage(cause));
    } finally {
      savingRef.current = false;
      if (focused.current) setSaving(false);
    }
  }

  const dayTitle = dateFromKey(selectedDay).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.petFilters}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All pets"
          accessibilityState={{ selected: !petFilter }}
          onPress={() => setPetFilter("")}
          style={[styles.petChip, !petFilter && styles.petChipActive]}
        >
          <PawIcon size={17} color={!petFilter ? "#FFFFFF" : "#214C36"} />
          <Text style={[styles.chipText, !petFilter && styles.chipTextActive]}>
            All pets
          </Text>
        </Pressable>
        {pets.map((pet) => (
          <Pressable
            key={pet.id}
            accessibilityRole="button"
            accessibilityLabel={"Show care for " + pet.name}
            accessibilityState={{ selected: petFilter === pet.id }}
            onPress={() => setPetFilter(pet.id)}
            style={[
              styles.petChip,
              petFilter === pet.id && styles.petChipActive,
            ]}
          >
            <View
              style={[styles.petAvatar, { backgroundColor: colorFor(pet.id) }]}
            >
              {pet.photoUrl ? (
                <Image
                  source={{ uri: petPhotoUri(pet.photoUrl)! }}
                  contentFit="cover"
                  style={styles.avatarImage}
                />
              ) : (
                <PawIcon size={17} color="#214C36" />
              )}
            </View>
            <Text
              style={[
                styles.chipText,
                petFilter === pet.id && styles.chipTextActive,
              ]}
            >
              {pet.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeading}>
          <View style={styles.monthHeading}>
            <Text style={styles.eyebrow}>CARE CALENDAR</Text>
            <Text style={[styles.monthTitle, { fontFamily: serif }]}>
              {month.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.monthActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => setMonth((current) => shiftMonth(current, -1))}
              style={styles.monthArrow}
            >
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <ChevronRightIcon size={20} color="#191C14" />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => setMonth((current) => shiftMonth(current, 1))}
              style={styles.monthArrow}
            >
              <ChevronRightIcon size={20} color="#191C14" />
            </Pressable>
          </View>
        </View>
        <View style={styles.weekdays}>
          {weekdayLabels.map((label) => (
            <Text key={label} style={styles.weekday}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.days}>
          {monthDays(month).map((date) => {
            const day = localDateKey(date);
            const entries = byDay.get(day) || [];
            const selected = day === selectedDay;
            const outside = date.getMonth() !== month.getMonth();
            const petIds = [...new Set(entries.map((item) => item.petId))];
            return (
              <View key={day} style={styles.dayColumn}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    careDayLabel(date) +
                    ", " +
                    entries.length +
                    (entries.length === 1 ? " care item" : " care items")
                  }
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => openDay(day)}
                  style={[
                    styles.dayCell,
                    entries.length > 0 && {
                      backgroundColor: colorFor(entries[0].petId),
                    },
                    selected && styles.selectedDay,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      outside && styles.outsideDay,
                      selected && styles.selectedDayText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {entries.length > 0 ? (
                    <View style={styles.dayMarker}>
                      {selected ? (
                        <View style={styles.selectedDot} />
                      ) : (
                        <PawIcon size={12} color="#76816D" />
                      )}
                      {petIds.length > 1 ? (
                        <View
                          style={[
                            styles.extraPetDot,
                            { backgroundColor: colorFor(petIds[1]) },
                          ]}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
        <View style={styles.legend}>
          {pets
            .filter((pet) => !petFilter || pet.id === petFilter)
            .map((pet) => (
              <View key={pet.id} style={styles.legendItem}>
                <View
                  style={[styles.petDot, { backgroundColor: colorFor(pet.id) }]}
                />
                <Text style={styles.legendText}>{pet.name}</Text>
              </View>
            ))}
          <View style={styles.legendItem}>
            <PawIcon size={12} color="#76816D" />
            <Text style={styles.legendText}>Reminder scheduled</Text>
          </View>
        </View>
        {busy ? (
          <View style={styles.notice}>
            <ActivityIndicator size="small" color="#214C36" />
            <Text style={styles.noticeText}>Loading care schedules…</Text>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.error}>
              {loadError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load(true)}
            >
              <Text style={styles.manageText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {!loadingPets && pets.length === 0 ? (
        <Text style={styles.noticeText}>
          Add your first pet to start planning their care.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a reminder"
        disabled={busy || !pets.length}
        onPress={() => openCreate(selectedDay)}
        style={[styles.addButton, (busy || !pets.length) && styles.disabled]}
      >
        <PlusIcon size={17} color="#214C36" />
        <Text style={styles.addText}>Add a reminder</Text>
      </Pressable>

      <Modal
        visible={sheet !== "closed"}
        transparent
        animationType={Platform.OS === "web" ? "none" : "fade"}
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss care sheet"
            style={StyleSheet.absoluteFill}
            onPress={closeSheet}
            disabled={saving}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContent}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeading}>
                  <Text style={styles.sheetEyebrow}>
                    {sheet === "create" ? "NEW CARE ITEM" : "SCHEDULED CARE"}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={[styles.sheetTitle, { fontFamily: serif }]}
                  >
                    {sheet === "create" ? "Add a reminder" : dayTitle}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close care sheet"
                  disabled={saving}
                  onPress={closeSheet}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              {sheet === "create" ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      "Choose pet for reminder, " +
                      (formPet?.name || "none selected")
                    }
                    disabled={saving}
                    onPress={() => setChoosePet((current) => !current)}
                    style={styles.formPet}
                  >
                    <View
                      style={[
                        styles.petDot,
                        { backgroundColor: colorFor(formPetId) },
                      ]}
                    />
                    <Text style={styles.formPetText}>
                      For {formPet?.name || "a pet"}
                    </Text>
                    <Text style={styles.formPetArrow}>⌄</Text>
                  </Pressable>
                  {choosePet ? (
                    <View style={styles.formPetChoices}>
                      {pets.map((pet) => (
                        <Pressable
                          key={pet.id}
                          accessibilityRole="button"
                          accessibilityLabel={"Assign reminder to " + pet.name}
                          accessibilityState={{
                            selected: formPetId === pet.id,
                          }}
                          onPress={() => {
                            setFormPetId(pet.id);
                            setChoosePet(false);
                          }}
                          style={[
                            styles.choice,
                            formPetId === pet.id && styles.choiceActive,
                          ]}
                        >
                          <Text style={styles.formPetText}>{pet.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.form}>
                    <View>
                      <Text style={styles.fieldLabel}>Reminder</Text>
                      <TextInput
                        accessibilityLabel="Reminder"
                        value={title}
                        onChangeText={setTitle}
                        editable={!saving}
                        placeholder="e.g. Vet appointment"
                        placeholderTextColor="#969185"
                        maxLength={120}
                        style={styles.input}
                      />
                    </View>
                    <CareDateTimeFields
                      dateValue={dateValue}
                      timeValue={timeValue}
                      onDateChange={setDateValue}
                      onTimeChange={setTimeValue}
                      disabled={saving}
                    />
                    {saveError ? (
                      <Text accessibilityRole="alert" style={styles.error}>
                        {saveError}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save reminder"
                      disabled={saving}
                      onPress={() => void saveReminder()}
                      style={[styles.saveButton, saving && styles.disabled]}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <CheckIcon size={17} color="#FFFFFF" />
                      )}
                      <Text style={styles.saveText}>
                        {saving ? "Saving…" : "Save reminder"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.daySubtitle}>
                    {dateFromKey(selectedDay).toLocaleDateString("en-US", {
                      weekday: "long",
                    })}
                    , {dateFromKey(selectedDay).getFullYear()} ·{" "}
                    {petFilter
                      ? pets.find((pet) => pet.id === petFilter)?.name
                      : "All pets"}
                  </Text>
                  <View style={styles.detailList}>
                    {dayItems.length ? (
                      dayItems.map((item) => (
                        <CareItemDetails
                          key={item.key}
                          item={item}
                          color={colorFor(item.petId)}
                          onManage={(id) => {
                            setSheet("closed");
                            router.push({
                              pathname: "/reminder-details",
                              params: { id },
                            });
                          }}
                        />
                      ))
                    ) : (
                      <Text style={styles.emptyText}>
                        {loadError
                          ? "Schedules could not be loaded. Close this sheet and retry."
                          : "No care scheduled for this date."}
                      </Text>
                    )}
                  </View>
                  {pets.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add a reminder for this date"
                      disabled={busy}
                      onPress={() => openCreate(selectedDay)}
                      style={styles.saveButton}
                    >
                      <PlusIcon size={17} color="#FFFFFF" />
                      <Text style={styles.saveText}>Add a reminder</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    marginTop: 28,
    gap: 20,
  },
  petFilters: { flexDirection: "row", gap: 12, paddingRight: 4 },
  petChip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5DDCF",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  petChipActive: { backgroundColor: "#0B3B23", borderColor: "#0B3B23" },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#172014",
    fontWeight: "500",
  },
  chipTextActive: { color: "#FFFFFF", fontWeight: "600" },
  petAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DDCF",
    borderRadius: 20,
    padding: 16,
  },
  calendarHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthHeading: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: Fonts.sans,
    color: "#70684F",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.1,
  },
  monthTitle: { color: "#171B13", fontSize: 30, lineHeight: 37, marginTop: 2 },
  monthActions: { flexDirection: "row", gap: 4 },
  monthArrow: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdays: { flexDirection: "row", marginTop: 23, marginBottom: 10 },
  weekday: {
    width: "14.285714%",
    textAlign: "center",
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#70684F",
  },
  days: { flexDirection: "row", flexWrap: "wrap", rowGap: 4 },
  dayColumn: { width: "14.285714%", alignItems: "center" },
  dayCell: {
    width: "100%",
    maxWidth: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumber: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "500",
    color: "#0D2118",
  },
  outsideDay: { color: "#CDC6BE" },
  selectedDay: { backgroundColor: "#0B3B23" },
  selectedDayText: { color: "#FFFFFF", fontWeight: "700" },
  dayMarker: {
    position: "absolute",
    bottom: 5,
    right: 6,
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  extraPetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  legend: {
    borderTopWidth: 1,
    borderTopColor: "#E5DDCF",
    paddingTop: 16,
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  petDot: { width: 11, height: 11, borderRadius: 6 },
  legendText: { fontFamily: Fonts.sans, fontSize: 11, color: "#70684F" },
  notice: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  noticeText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#70684F",
    lineHeight: 18,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#E5DDCF",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  addText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: "#214C36",
  },
  disabled: { opacity: 0.5 },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(30,26,17,0.35)",
    paddingHorizontal: 10,
    paddingTop: 48,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  sheetContent: { paddingHorizontal: 24, paddingTop: 24 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetHeading: { flex: 1 },
  sheetEyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "600",
    color: "#D98756",
    letterSpacing: 1.3,
  },
  sheetTitle: { fontSize: 32, lineHeight: 39, color: "#211F16", marginTop: 2 },
  closeButton: {
    width: 36,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  closeText: {
    fontFamily: Fonts.sans,
    fontSize: 27,
    fontWeight: "300",
    color: "#211F16",
  },
  formPet: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
  },
  formPetText: { fontFamily: Fonts.sans, fontSize: 12, color: "#70684F" },
  formPetArrow: { color: "#70684F", fontSize: 14 },
  formPetChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  choice: {
    borderWidth: 1,
    borderColor: "#E5DDCF",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { backgroundColor: "#EAF4E5" },
  form: { marginTop: 20, gap: 18 },
  fieldLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#242218",
    marginBottom: 7,
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#242218",
    borderWidth: 1,
    borderColor: "#E5DCCB",
    borderRadius: 12,
    backgroundColor: "#FCF9F1",
  },
  saveButton: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#214C36",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: "#AD452E",
    flexShrink: 1,
  },
  daySubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#70684F",
    marginTop: 8,
  },
  detailList: { gap: 12, marginTop: 20, marginBottom: 20 },
  detailCard: {
    backgroundColor: "#FCF9F1",
    borderWidth: 1,
    borderColor: "#E5DCCB",
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  detailTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  detailPet: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    color: "#214C36",
  },
  itemTime: { fontFamily: Fonts.sans, fontSize: 12, color: "#70684F" },
  detailTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "600",
    color: "#211F16",
    lineHeight: 23,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  status: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "600",
    color: "#214C36",
    backgroundColor: "#EAF4E5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  source: { fontFamily: Fonts.sans, fontSize: 11, color: "#70684F" },
  detailRow: { gap: 3, marginTop: 2 },
  detailLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "600",
    color: "#8B826F",
  },
  detailValue: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: "#302D22",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    minHeight: 32,
  },
  manageText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "600",
    color: "#214C36",
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#70684F",
    lineHeight: 21,
    paddingVertical: 12,
  },
});
