import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
  PawIcon,
  PlusIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { parseIsoDate } from '@/lib/date';
import {
  reminderDaysUntil,
  reminderStatus,
  reminderWhen,
  type HealthReminder,
  useHealthReminders,
} from '@/lib/health';
import { goBack } from '@/lib/navigation';
import { usePets, type Pet } from '@/lib/pets';

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type DayKey = { year: number; month: number; day: number };

function toOn(iso: string): DayKey {
  const date = parseIsoDate(iso);
  if (!date) return { year: 2026, month: 8, day: 1 };
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function isSameDay(a: DayKey, y: number, m: number, d: number) {
  return a.year === y && a.month === m && a.day === d;
}

function bucketFor(days: number): 'overdue' | 'thisWeek' | 'nextWeek' | 'later' {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'thisWeek';
  if (days <= 14) return 'nextWeek';
  return 'later';
}

function StatusPill({ status }: { status: ReturnType<typeof reminderStatus> }) {
  const label = status === 'Due today' ? 'Due soon' : status;
  const isDue = status === 'Due soon' || status === 'Due today';
  const isOverdue = status === 'Overdue';
  const isCompleted = status === 'Completed';
  return (
    <View
      style={[
        styles.statusPill,
        isCompleted
          ? styles.statusCompleted
          : isOverdue
            ? styles.statusOverdue
            : isDue
              ? styles.statusDue
              : styles.statusUpcoming,
      ]}>
      <Text style={[styles.statusText, isOverdue && styles.statusTextOverdue]}>{label}</Text>
    </View>
  );
}

function PetAvatar({ pet }: { pet?: Pet }) {
  if (pet?.photo) {
    return <Image source={{ uri: pet.photo }} style={styles.avatar} contentFit="cover" />;
  }
  return (
    <View style={styles.avatar}>
      <PawIcon size={22} color={Palette.forestDark} />
    </View>
  );
}

function ReminderCard({
  reminder,
  pet,
  onPress,
}: {
  reminder: HealthReminder;
  pet?: Pet;
  onPress: () => void;
}) {
  const status = reminderStatus(reminder);
  const isOverdue = status === 'Overdue';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.reminderCard,
        isOverdue && styles.reminderCardOverdue,
        pressed && styles.pressed,
      ]}>
      <PetAvatar pet={pet} />
      <View style={styles.reminderBody}>
        <View style={styles.reminderTopRow}>
          <Text numberOfLines={1} style={styles.reminderTitle}>
            {reminder.title}
          </Text>
          <StatusPill status={status} />
        </View>
        <Text style={styles.reminderPet}>{reminder.petName}</Text>
        <Text style={styles.reminderWhen}>{reminderWhen(reminder)}</Text>
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

function SummaryCard({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'due' | 'overdue';
}) {
  return (
    <View style={styles.summaryCard}>
      <Text
        style={[
          styles.summaryValue,
          tone === 'overdue' && value > 0 && styles.summaryValueOverdue,
          tone === 'due' && value > 0 && styles.summaryValueDue,
        ]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MonthCalendar({
  viewDate,
  reminders,
  selected,
  onShift,
  onSelectDay,
}: {
  viewDate: { year: number; month: number };
  reminders: HealthReminder[];
  selected: DayKey | null;
  onShift: (delta: number) => void;
  onSelectDay: (day: DayKey) => void;
}) {
  const { year, month } = viewDate;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onShift(-1)}
          style={({ pressed }) => [styles.calendarNav, pressed && styles.pressed]}>
          <ChevronLeftIcon />
        </Pressable>
        <Text style={styles.calendarMonth}>{`${monthNames[month]} ${year}`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onShift(1)}
          style={({ pressed }) => [styles.calendarNav, pressed && styles.pressed]}>
          <ChevronRightIcon />
        </Pressable>
      </View>

      <View style={styles.calendarDivider} />

      <View style={styles.weekRow}>
        {weekDays.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={styles.dayCell} />;
          }
          const hasReminder = reminders.some((r) => isSameDay(toOn(r.dueDate), year, month, day));
          const isSelected = selected !== null && isSameDay(selected, year, month, day);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`${monthNames[month]} ${day}`}
              onPress={() => onSelectDay({ year, month, day })}
              style={styles.dayCell}>
              <View
                style={[
                  styles.dayCircle,
                  hasReminder ? styles.dayCircleMarked : null,
                  isSelected ? styles.dayCircleSelected : null,
                ]}>
                <Text
                  style={[
                    styles.dayLabel,
                    hasReminder ? styles.dayLabelMarked : null,
                    isSelected ? styles.dayLabelSelected : null,
                  ]}>
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function HealthRemindersScreen() {
  const router = useRouter();
  const reminders = useHealthReminders();
  const pets = usePets();
  const sorted = [...reminders].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const active = sorted.filter((reminder) => !reminder.completedAt);
  const completed = sorted.filter((reminder) => Boolean(reminder.completedAt));

  const overdueCount = active.filter((reminder) => reminderStatus(reminder) === 'Overdue').length;
  const dueSoonCount = active.filter((reminder) => {
    const status = reminderStatus(reminder);
    return status === 'Due soon' || status === 'Due today';
  }).length;
  const upcomingCount = active.filter((reminder) => reminderStatus(reminder) === 'Upcoming').length;

  const groups = (['overdue', 'thisWeek', 'nextWeek', 'later'] as const)
    .map((key) => ({
      key,
      label: key === 'thisWeek' ? 'This week' : key === 'nextWeek' ? 'Next week' : key === 'later' ? 'Later' : 'Overdue',
      items: active.filter((reminder) => bucketFor(reminderDaysUntil(reminder.dueDate)) === key),
    }))
    .filter((group) => group.items.length > 0);

  const now = new Date();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [viewDate, setViewDate] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<DayKey | null>(null);

  const petFor = (id: string) => pets.find((pet) => pet.id === id);

  const openReminder = (reminder: HealthReminder) =>
    router.push({ pathname: '/reminder-details', params: { reminder: reminder.id } });

  const shiftMonth = (delta: number) => {
    const nextMonth = viewDate.month + delta;
    setSelected(null);
    if (nextMonth < 0) {
      setViewDate({ year: viewDate.year - 1, month: 11 });
    } else if (nextMonth > 11) {
      setViewDate({ year: viewDate.year + 1, month: 0 });
    } else {
      setViewDate({ ...viewDate, month: nextMonth });
    }
  };

  const selectView = (key: 'list' | 'calendar') => {
    setView(key);
    if (key === 'calendar' && selected === null) {
      const first = active[0];
      setSelected(
        first
          ? toOn(first.dueDate)
          : { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() },
      );
    }
  };

  const selectedReminders =
    selected === null
      ? []
      : sorted.filter((reminder) =>
          isSameDay(toOn(reminder.dueDate), selected.year, selected.month, selected.day),
        );

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
              onPress={() => goBack('/dashboard')}
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

          <Text style={styles.category}>STAY ON SCHEDULE</Text>
          <Text style={styles.heading}>Health reminders</Text>
          <Text style={styles.supporting}>
            Keep your pets&apos; vaccinations, checkups, and treatments on track.
          </Text>

          <View style={styles.summaryRow}>
            <SummaryCard value={upcomingCount} label="Upcoming" />
            <SummaryCard value={dueSoonCount} label="Due soon" tone="due" />
            <SummaryCard value={overdueCount} label="Overdue" tone="overdue" />
          </View>

          <View style={styles.segment}>
            {(['list', 'calendar'] as const).map((key) => {
              const isActive = view === key;
              const Icon = key === 'list' ? ListIcon : GridIcon;
              const label = key === 'list' ? 'List' : 'Calendar';
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => selectView(key)}
                  style={[styles.segmentItem, isActive && styles.segmentItemActive]}>
                  <Icon size={15} color={isActive ? Palette.white : Palette.forestDark} />
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {view === 'list' ? (
            <View style={styles.list}>
              {active.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No upcoming reminders</Text>
                  <Text style={styles.emptyText}>
                    Add a health reminder so you never miss an important vaccination, checkup, or
                    treatment.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/add-reminder')}
                    style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                    <PlusIcon size={16} />
                    <Text style={styles.emptyButtonLabel}>Add reminder</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {groups.map((group) => (
                    <View key={group.key} style={styles.section}>
                      <Text
                        style={[
                          styles.sectionLabel,
                          group.key === 'overdue' && styles.sectionLabelOverdue,
                        ]}>
                        {group.label}
                      </Text>
                      <View style={styles.sectionList}>
                        {group.items.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            pet={petFor(reminder.petId)}
                            onPress={() => openReminder(reminder)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/add-reminder')}
                    style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                    <PlusIcon size={16} />
                    <Text style={styles.addButtonLabel}>Add reminder</Text>
                  </Pressable>
                </>
              )}

              {completed.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Completed</Text>
                  <View style={styles.sectionList}>
                    {completed.map((reminder) => (
                      <ReminderCard
                        key={reminder.id}
                        reminder={reminder}
                        pet={petFor(reminder.petId)}
                        onPress={() => openReminder(reminder)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              <MonthCalendar
                viewDate={viewDate}
                reminders={sorted}
                selected={selected}
                onShift={shiftMonth}
                onSelectDay={setSelected}
              />

              {selected !== null ? (
                <View style={styles.selectedSection}>
                  <Text style={styles.selectedDateLabel}>
                    {`${monthNames[selected.month]} ${selected.day}`}
                  </Text>
                  {selectedReminders.length > 0 ? (
                    <View style={styles.sectionList}>
                      {selectedReminders.map((reminder) => (
                        <ReminderCard
                          key={reminder.id}
                          reminder={reminder}
                          pet={petFor(reminder.petId)}
                          onPress={() => openReminder(reminder)}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>No reminders for this day</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </>
          )}
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
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  summaryValue: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  summaryValueDue: {
    color: Palette.gold,
  },
  summaryValueOverdue: {
    color: Palette.danger,
  },
  summaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.four,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: Palette.white,
  },
  list: {
    marginTop: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionList: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: Palette.inkMuted,
    textTransform: 'uppercase',
  },
  sectionLabelOverdue: {
    color: Palette.danger,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    minHeight: 80,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.06)',
  },
  reminderCardOverdue: {
    borderColor: Palette.danger,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reminderBody: {
    flex: 1,
    gap: 2,
  },
  reminderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  reminderTitle: {
    flexShrink: 1,
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  statusDue: {
    backgroundColor: Palette.goldSoft,
  },
  statusUpcoming: {
    backgroundColor: Palette.sage,
  },
  statusCompleted: {
    backgroundColor: Palette.segmentTrack,
  },
  statusOverdue: {
    backgroundColor: Palette.danger,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  statusTextOverdue: {
    color: Palette.white,
  },
  reminderPet: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  reminderWhen: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 22,
    backgroundColor: Palette.gold,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  addButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    backgroundColor: Palette.surface,
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  emptyButtonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  calendarCard: {
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    boxShadow: '0px 3px 8px rgba(27,67,50,0.06)',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  calendarNav: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonth: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  calendarDivider: {
    height: 1,
    backgroundColor: Palette.borderSoft,
    marginVertical: Spacing.three,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
  dayCell: {
    width: `${100 / 7}%` as unknown as number,
    aspectRatio: 1,
    maxHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleMarked: {
    backgroundColor: Palette.gold,
  },
  dayCircleSelected: {
    backgroundColor: Palette.sage,
  },
  dayLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  dayLabelMarked: {
    fontWeight: '800',
  },
  dayLabelSelected: {
    fontWeight: '800',
  },
  selectedSection: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  selectedDateLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
