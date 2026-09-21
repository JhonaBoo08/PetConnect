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

type Reminder = {
  id: string;
  title: string;
  pet: string;
  when: string;
  time: string;
  on: { year: number; month: number; day: number };
  due: boolean;
};

const reminders: Reminder[] = [
  {
    id: 'fvrcp',
    title: 'FVRCP booster',
    pet: 'Mingming',
    when: 'Sep 20 · 9:30 AM',
    time: '9:30 AM',
    on: { year: 2026, month: 8, day: 20 },
    due: true,
  },
  {
    id: 'deworming',
    title: 'Deworming',
    pet: 'Bantay',
    when: 'Oct 08 · 10:00 AM',
    time: '10:00 AM',
    on: { year: 2026, month: 9, day: 8 },
    due: false,
  },
  {
    id: 'wellness',
    title: 'Wellness check',
    pet: 'Bantay',
    when: 'Oct 29 · 2:00 PM',
    time: '2:00 PM',
    on: { year: 2026, month: 9, day: 29 },
    due: false,
  },
];

const groups: { label: string; items: Reminder[] }[] = [
  { label: 'This week', items: [reminders[0]] },
  { label: 'Next month', items: reminders.slice(1) },
];

function isSameDay(a: { year: number; month: number; day: number }, y: number, m: number, d: number) {
  return a.year === y && a.month === m && a.day === d;
}

function ReminderRow({ reminder, onPress }: { reminder: Reminder; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reminderCard, pressed && styles.pressed]}>
      <View style={[styles.reminderIcon, reminder.due ? styles.reminderIconDue : styles.reminderIconUpcoming]}>
        <CalendarIcon size={22} color={Palette.forestDark} />
      </View>
      <View style={styles.reminderBody}>
        <Text style={styles.reminderTitle}>{`${reminder.pet} · ${reminder.title}`}</Text>
        <Text style={styles.reminderWhen}>{reminder.when}</Text>
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

function MonthCalendar({
  viewDate,
  selected,
  onShift,
  onSelectDay,
}: {
  viewDate: { year: number; month: number };
  selected: { year: number; month: number; day: number } | null;
  onShift: (delta: number) => void;
  onSelectDay: (day: { year: number; month: number; day: number }) => void;
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
          <ChevronRightIcon color={Palette.forestDark} />
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
          const isReminder = reminders.some((r) => isSameDay(r.on, year, month, day));
          const isSelected = selected !== null && isSameDay(selected, year, month, day);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`${monthNames[month]} ${day}`}
              onPress={() => onSelectDay({ year, month, day })}
              style={styles.dayCell}>
              <View style={[styles.dayCircle, isReminder ? styles.dayCircleDue : isSelected ? styles.dayCircleSelected : null]}>
                <Text
                  style={[
                    styles.dayLabel,
                    isReminder ? styles.dayLabelDue : isSelected ? styles.dayLabelSelected : null,
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

export default function ViewReminderScreen() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [viewDate, setViewDate] = useState({ year: 2026, month: 8 });
  const [selected, setSelected] = useState<{ year: number; month: number; day: number } | null>({
    year: 2026,
    month: 8,
    day: 20,
  });

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

  const selectedReminders =
    selected === null
      ? []
      : reminders.filter((r) => isSameDay(r.on, selected.year, selected.month, selected.day));

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
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/alerts')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
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
              {groups.map((group) => (
                <View key={group.label} style={styles.listSection}>
                  <Text style={styles.sectionLabel}>{group.label}</Text>
                  {group.items.map((reminder) => (
                    <ReminderRow
                      key={reminder.id}
                      reminder={reminder}
                      onPress={() => router.push('/reminder-details')}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <>
              <MonthCalendar
                viewDate={viewDate}
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
                    <View style={styles.selectedList}>
                      {selectedReminders.map((reminder) => (
                        <ReminderRow
                          key={reminder.id}
                          reminder={reminder}
                          onPress={() => router.push('/reminder-details')}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyLabel}>No reminders for this day</Text>
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Palette.segmentTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.four,
    gap: 4,
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
    gap: Spacing.four,
    marginTop: Spacing.four,
  },
  listSection: {
    gap: Spacing.three,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: Palette.inkMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.one,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 68,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    boxShadow: '0 3px 8px rgba(0, 15, 3, 0.06)',
  },
  reminderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderIconDue: {
    backgroundColor: Palette.goldSoft,
  },
  reminderIconUpcoming: {
    backgroundColor: Palette.sage,
  },
  reminderBody: {
    flex: 1,
    gap: 2,
  },
  reminderTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    fontWeight: '800',
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
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    boxShadow: '0 3px 8px rgba(0, 15, 3, 0.06)',
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDue: {
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
  dayLabelDue: {
    fontWeight: '800',
  },
  dayLabelSelected: {
    fontWeight: '700',
  },
  selectedSection: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  selectedDateLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Palette.forestDark,
  },
  selectedList: {
    gap: Spacing.three,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
  },
  emptyLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});