import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  HealthIcon,
  PinIcon,
  SyringeIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type Notification = {
  id: string;
  Icon: typeof SyringeIcon;
  title: string;
  description: string;
  timestamp: string;
  unread: boolean;
  route: '/reminder-details' | '/alerts' | { pathname: '/record-details'; params: { record: string; name: string } };
};

const initialNotifications: Notification[] = [
  {
    id: 'booster',
    Icon: SyringeIcon,
    title: 'Booster due soon',
    description: "Mingming's FVRCP booster is due in 3 days.",
    timestamp: '2h',
    unread: true,
    route: '/reminder-details',
  },
  {
    id: 'lost-pet',
    Icon: PinIcon,
    title: 'Lost pet nearby',
    description: 'A brown Aspin was last seen near Mankilam.',
    timestamp: '4h',
    unread: true,
    route: '/alerts',
  },
  {
    id: 'verified-record',
    Icon: HealthIcon,
    title: 'Health record verified',
    description: "Tagum Pet Care verified Bantay's anti-rabies record.",
    timestamp: 'Yesterday',
    unread: false,
    route: { pathname: '/record-details', params: { record: 'anti-rabies', name: 'Bantay' } },
  },
];

function NotificationCard({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const { Icon, title, description, timestamp, unread } = notification;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.notificationCard,
        unread && styles.notificationCardUnread,
        pressed && styles.pressed,
      ]}>
      <View style={styles.notificationIcon}>
        <Icon size={22} color={Palette.forestDark} />
      </View>
      <View style={styles.notificationBody}>
        <View style={styles.notificationTopRow}>
          <Text style={[styles.notificationTitle, unread && styles.notificationTitleUnread]}>
            {title}
          </Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <Text style={[styles.notificationDescription, unread && styles.notificationDescriptionUnread]}>
          {description}
        </Text>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const open = (notification: Notification) => {
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, unread: false } : n)));
    router.push(notification.route);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/dashboard')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>

          <Text style={styles.category}>UPDATES</Text>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.supporting}>Health alerts, reminders, and recovery activity.</Text>

          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <BellIcon size={28} color={Palette.forestDark} />
              </View>
              <Text style={styles.emptyStateTitle}>You're all caught up</Text>
              <Text style={styles.emptyStateText}>
                New pet updates and reminders will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onPress={() => open(notification)}
                />
              ))}
            </View>
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
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  notificationCardUnread: {
    backgroundColor: '#FFFDF7',
    borderColor: Palette.sage,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBody: {
    flex: 1,
    gap: 3,
  },
  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  notificationTitle: {
    flexShrink: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  notificationTitleUnread: {
    fontWeight: '800',
  },
  timestamp: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    color: Palette.inkMuted,
  },
  notificationDescription: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  notificationDescriptionUnread: {
    color: Palette.forestDark,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.gold,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
});