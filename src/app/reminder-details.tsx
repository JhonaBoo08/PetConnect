import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  PawIcon,
  PinIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { DateField } from '@/components/date-field';
import { TimeField } from '@/components/time-field';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isoToDisplayDate, isoToFullMonthDay, toIsoDate } from '@/lib/date';
import {
  describeReminder,
  removeReminder,
  reminderNotificationTimings,
  reminderStatus,
  reminderWhen,
  rescheduleReminder,
  setReminderNotificationTiming,
  toggleReminderCompleted,
  useHealthReminders,
  type ReminderNotificationTiming,
  type ReminderStatus,
} from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { petAge, usePets } from '@/lib/pets';

function StatusBadge({ status }: { status: ReminderStatus }) {
  if (status === 'Completed') {
    return (
      <View style={styles.completedBadge}>
        <CheckIcon size={14} color={Palette.forestDark} />
        <Text style={styles.completedBadgeLabel}>Completed</Text>
      </View>
    );
  }
  const isDue = status === 'Due soon' || status === 'Due today';
  const isOverdue = status === 'Overdue';
  return (
    <View
      style={[
        styles.statusBadge,
        isOverdue ? styles.badgeOverdue : isDue ? styles.badgeDue : styles.badgeUpcoming,
      ]}>
      <View
        style={[
          styles.statusDot,
          isOverdue ? styles.statusDotOverdue : isDue ? styles.statusDotDue : styles.statusDotUpcoming,
        ]}
      />
      <Text style={[styles.statusLabel, isOverdue && styles.statusLabelOverdue]}>{status}</Text>
    </View>
  );
}

export default function ReminderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reminder?: string }>();
  const reminderId = Array.isArray(params.reminder) ? params.reminder[0] : params.reminder ?? '';

  const reminders = useHealthReminders();
  const reminder = reminders.find((candidate) => candidate.id === reminderId) ?? null;

  const pets = usePets();
  const pet = reminder ? pets.find((candidate) => candidate.id === reminder.petId) : undefined;

  const [removing, setRemoving] = useState(false);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [notify, setNotify] = useState<ReminderNotificationTiming>(reminderNotificationTimings[1]);

  if (!reminder) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/health-reminders')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Reminder not found</Text>
            <Text style={styles.emptyText}>
              This reminder may have been removed. Head back to your health reminders to keep
              browsing.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => goBack('/health-reminders')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryLabel}>Back to health reminders</Text>
            </Pressable>
          </View>
          <BottomNav active="home" />
        </SafeAreaView>
      </View>
    );
  }

  const petMeta = pet ? `${pet.breed} \u00b7 ${petAge(pet)}` : reminder.petName;

  const status = reminderStatus(reminder);
  const completed = reminder.completedAt !== null;

  const confirmComplete = async () => {
    setMarking(false);
    await toggleReminderCompleted(reminder.id);
  };

  const undoComplete = async () => {
    await toggleReminderCompleted(reminder.id);
  };

  const openReschedule = () => {
    setRescheduleDate(isoToDisplayDate(reminder.dueDate));
    setRescheduleTime(reminder.time);
    setShowReschedule(true);
  };

  const confirmReschedule = async () => {
    const iso = toIsoDate(rescheduleDate);
    if (!iso || !rescheduleTime) return;
    setRescheduling(true);
    try {
      await rescheduleReminder(reminder.id, iso, rescheduleTime);
      setShowReschedule(false);
    } finally {
      setRescheduling(false);
    }
  };

  const changeNotify = (option: ReminderNotificationTiming) => {
    setNotify(option);
    void setReminderNotificationTiming(reminder.id, option);
  };

  const confirmRemove = async () => {
    setRemovingBusy(true);
    try {
      await removeReminder(reminder.id);
      goBack('/health-reminders');
    } finally {
      setRemovingBusy(false);
    }
  };

  const rescheduleValid = Boolean(rescheduleTime && toIsoDate(rescheduleDate));

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/health-reminders')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>HEALTH REMINDER</Text>
          <Text style={styles.heading}>{reminder.title}</Text>
          <Text style={styles.supporting}>{reminder.petName}</Text>

          <StatusBadge status={status} />

          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <CalendarIcon size={22} color={Palette.forestDark} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardDate}>{reminderWhen(reminder)}</Text>
              <Text style={styles.cardTitle}>{reminder.title}</Text>
              <Text style={styles.cardPet}>{reminder.petName}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>About this reminder</Text>
          <Text style={styles.paragraph}>{describeReminder(reminder)}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/pet-id', params: { name: pet?.name ?? reminder.petName } })
            }
            style={({ pressed }) => [styles.petCard, pressed && styles.pressed]}>
            <View style={styles.petThumb}>
              <PawIcon size={24} color={Palette.forestDark} />
            </View>
            <View style={styles.petInfo}>
              <Text style={styles.petName}>{pet?.name ?? reminder.petName}</Text>
              <Text style={styles.petMeta}>{petMeta}</Text>
            </View>
            <ChevronRightIcon />
          </Pressable>

          {completed && reminder.completedAt ? (
            <View style={styles.completedPanel}>
              <View style={styles.completedIcon}>
                <CheckIcon size={20} color={Palette.forestDark} />
              </View>
              <Text style={styles.completedTitle}>Completed</Text>
              <Text style={styles.completedMeta}>
                Completed on {isoToFullMonthDay(reminder.completedAt)}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={completed ? undoComplete : () => setMarking(true)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>{completed ? 'Undo completion' : 'Mark as completed'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={openReschedule}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Reschedule</Text>
          </Pressable>

          <View style={styles.clinicCard}>
            <View style={styles.clinicIcon}>
              <PinIcon size={20} color={Palette.forestDark} />
            </View>
            <View style={styles.clinicBody}>
              <Text style={styles.clinicLabel}>VET CLINIC</Text>
              <Text style={styles.clinicName}>{reminder.clinicName}</Text>
            </View>
          </View>

          <View style={styles.notifySection}>
            <Text style={styles.sectionLabel}>Reminder notification</Text>
            <Text style={styles.notifyMeta}>Notify {notify}.</Text>
            <View style={styles.notifyRow}>
              {reminderNotificationTimings.map((option) => {
                const isActive = notify === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => changeNotify(option)}
                    style={[styles.notifyItem, isActive && styles.notifyItemActive]}>
                    <Text style={[styles.notifyLabel, isActive && styles.notifyLabelActive]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setRemoving(true)}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
            <Text style={styles.removeLabel}>Remove reminder</Text>
          </Pressable>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>

      {marking ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Mark reminder as completed?</Text>
            <Text style={styles.sheetMeta}>
              {reminder.petName}&apos;s {reminder.title} will be marked done and move to your
              completed reminders.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMarking(false)}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmComplete}
              style={({ pressed }) => [styles.sheetConfirm, pressed && styles.pressed]}>
              <Text style={styles.sheetConfirmLabel}>Mark as completed</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showReschedule ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Reschedule reminder</Text>
            <Text style={styles.sheetMeta}>
              Pick a new date and time, then confirm to update this reminder.
            </Text>
            <View style={styles.sheetFields}>
              <DateField
                value={rescheduleDate}
                onChange={setRescheduleDate}
                accessibilityLabel="New due date"
              />
              <TimeField value={rescheduleTime} onChange={setRescheduleTime} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowReschedule(false)}
              disabled={rescheduling}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !rescheduleValid || rescheduling }}
              onPress={confirmReschedule}
              disabled={!rescheduleValid || rescheduling}
              style={({ pressed }) => [
                styles.sheetConfirm,
                (!rescheduleValid || rescheduling) && styles.sheetDisabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.sheetConfirmLabel}>Confirm reschedule</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {removing ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Remove this reminder?</Text>
            <Text style={styles.sheetMeta}>
              This reminder will no longer appear in your health reminders. {reminder.petName}&apos;s
              health history is not affected.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRemoving(false)}
              disabled={removingBusy}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmRemove}
              disabled={removingBusy}
              style={({ pressed }) => [
                styles.sheetRemove,
                (pressed || removingBusy) && styles.pressed,
              ]}>
              <Text style={styles.sheetRemoveLabel}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
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
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    marginTop: Spacing.three,
  },
  badgeUpcoming: {
    backgroundColor: Palette.sage,
  },
  badgeDue: {
    backgroundColor: Palette.goldSoft,
  },
  badgeOverdue: {
    backgroundColor: Palette.danger,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotUpcoming: {
    backgroundColor: Palette.forestDark,
  },
  statusDotDue: {
    backgroundColor: Palette.gold,
  },
  statusDotOverdue: {
    backgroundColor: Palette.white,
  },
  statusLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  statusLabelOverdue: {
    color: Palette.white,
  },
  completedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.sage,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    marginTop: Spacing.three,
  },
  completedBadgeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    shadowColor: '#1B4332',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardDate: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  cardTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.inkMuted,
  },
  cardPet: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  paragraph: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
  },
  petThumb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInfo: {
    flex: 1,
    gap: 2,
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  completedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
    backgroundColor: Palette.sage,
    borderRadius: 16,
    padding: Spacing.three,
  },
  completedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  completedMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    marginTop: Spacing.five,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    marginTop: Spacing.three,
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  clinicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.five,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
  },
  clinicIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicBody: {
    flex: 1,
    gap: 2,
  },
  clinicLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: Palette.inkMuted,
  },
  clinicName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: Spacing.two,
  },
  notifySection: {
    marginTop: Spacing.five,
  },
  notifyMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  notifyRow: {
    flexDirection: 'row',
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.three,
  },
  notifyItem: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
  },
  notifyItemActive: {
    backgroundColor: Palette.forestDark,
  },
  notifyLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  notifyLabelActive: {
    color: Palette.white,
  },
  removeButton: {
    alignSelf: 'center',
    marginTop: Spacing.five,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  removeLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.danger,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20,40,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  sheetMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  sheetFields: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  sheetCancel: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  sheetCancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  sheetConfirm: {
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirmLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.white,
  },
  sheetRemove: {
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRemoveLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.white,
  },
  sheetDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});