import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { isoToShortDate, parseIsoDate } from '@/lib/date';
import { type HealthReminder, useHealthReminders } from '@/lib/health';
import { goBack } from '@/lib/navigation';

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

const DAY_MS = 86_400_000;

function daysUntil(iso: string): number {
  const due = parseIsoDate(iso);
  if (!due) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

function toOn(iso: string): { year: number; month: number; day: number } {
  const date = parseIsoDate(iso);
  if (!date) return { year: 2026, month: 8, day: 1 };
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function reminderWhen(reminder: HealthReminder): string {
  return `${isoToShortDate(reminder.dueDate)} \u00b7 ${reminder.time}`;
}

function reminderStatus(reminder: HealthReminder): 'Due soon' | 'Upcoming' {
  return daysUntil(reminder.dueDate) <= 30 ? 'Due soon' : 'Upcoming';
}

function isSameDay(a: { year: number; month: number; day: number }, y: number, m: number, d: number) {
  return a.year === y && a.month === m && a.day === d;
}

function ReminderCard({ reminder, onPress }: { reminder: HealthReminder; onPress: () => void }) {
  const status = reminderStatus(reminder);
  const isDue = status === 'Due soon';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reminderCard, pressed && styles.pressed]}>
      <View style={styles.reminderIcon}>
        <CalendarIcon size={24} color={Palette.forestDark} />
      </View>
      <View style={styles.reminderBody}>
        <View style={styles.reminderTopRow}>
          <Text style={styles.reminderTitle}>{reminder.title}</Text>
          <View style={[styles.statusPill, isDue ? styles.statusDue : styles.statusUpcoming]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>
        <Text style={styles.reminderPet}>{reminder.petName}</Text>
        <Text style={styles.reminderWhen}>{reminderWhen(reminder)}</Text>
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

function MonthCalendar({
  viewDate,
  reminders,
  highlighted,
  onShift,
}: {
  viewDate: { year: number; month: number };
  reminders: HealthReminder[];
  highlighted: { year: number; month: number; day: number } | null;
  onShift: (delta: number) => void;
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
          const isDue = highlighted !== null && isSameDay(highlighted, year, month, day);
          const hasReminder = reminders.some((r) => isSameDay(toOn(r.dueDate), year, month, day));
          return (
            <View key={day} style={styles.dayCell}>
              <View
                style={[
                  styles.dayCircle,
                  isDue ? styles.dayCircleDue : hasReminder ? styles.dayCircleMarked : null,
                ]}>
                <Text
                  style={[
                    styles.dayLabel,
                    isDue ? styles.dayLabelDue : hasReminder ? styles.dayLabelMarked : null,
                  ]}>
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function HealthRemindersScreen() {
  const router = useRouter();
  const reminders = useHealthReminders();
  const sorted = [...reminders].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const highlightedIso =
    sorted.find((reminder) => daysUntil(reminder.dueDate) <= 30)?.dueDate ??
    sorted[0]?.dueDate ??
    '';
  const highlighted = highlightedIso ? toOn(highlightedIso) : null;

  const now = new Date();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [viewDate, setViewDate] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const shiftMonth = (delta: number) => {
    const nextMonth = viewDate.month + delta;
    if (nextMonth < 0) {
      setViewDate({ year: viewDate.year - 1, month: 11 });
    } else if (nextMonth > 11) {
      setViewDate({ year: viewDate.year + 1, month: 0 });
    } else {
      setViewDate({ ...viewDate, month: nextMonth });
    }
  };

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
                  onPress={() => setView(key)}
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
              {sorted.length > 0 ? (
                sorted.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onPress={() => router.push('/reminder-details')}
                  />
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyLabel}>No health reminders yet.</Text>
                  <Text style={styles.emptyHint}>
                    Set a next due date on a health record to create one.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <>
              <MonthCalendar
                viewDate={viewDate}
                reminders={sorted}
                highlighted={highlighted}
                onShift={shiftMonth}
              />
              <View style={styles.calendarNavRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => shiftMonth(-1)}
                  style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}>
                  <ChevronLeftIcon size={16} />
                  <Text style={styles.calendarNavLabel}>Previous</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => shiftMonth(1)}
                  style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}>
                  <Text style={styles.calendarNavLabel}>Next</Text>
                  <ChevronRightIcon size={16} />
                </Pressable>
              </View>
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
    gap: Spacing.three,
    marginTop: Spacing.four,
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
    minHeight: 88,
    shadowColor: '#1B4332',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  reminderIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
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
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    color: Palette.forestDark,
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
  calendarCard: {
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    shadowColor: '#1B4332',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
  dayCircleDue: {
    backgroundColor: Palette.gold,
  },
  dayCircleMarked: {
    backgroundColor: Palette.goldTrack,
  },
  dayLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  dayLabelDue: {
    fontWeight: '800',
  },
  dayLabelMarked: {
    fontWeight: '700',
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  calendarNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
  },
  calendarNavLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
  },
  emptyLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  emptyHint: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});