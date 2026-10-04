import { useFocusEffect, useRouter } from "expo-router";
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

import { BackArrow, BellIcon, ChevronRightIcon } from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { notificationTarget } from "@/lib/notification-target";
import { enableRecoveryPush, requestCurrentCoordinates } from "@/services/device-recovery";
import { authErrorMessage } from "@/services/auth-context";
import {
  listRecoveryNotifications,
  markRecoveryNotificationRead,
} from "@/services/recovery-network";
import type { RecoveryNotification } from "../../../shared/contracts";

function when(value: string) {
  return new Date(value).toLocaleString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<RecoveryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [enablingPush, setEnablingPush] = useState(false);

  const load = useCallback(async () => {
    const rows = await listRecoveryNotifications();
    setItems(rows);
    setError("");
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

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  async function openNotification(item: RecoveryNotification) {
    if (!item.readAt) {
      try {
        await markRecoveryNotificationRead(item.id);
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? { ...row, readAt: new Date().toISOString() }
              : row,
          ),
        );
      } catch {
        // Opening should still work if read-state synchronization fails.
      }
    }

    const target = notificationTarget({ ...item.data, type: item.type }, "OWNER");
    // Items without a detail destination stay in the inbox after being read.
    if (target !== "/notifications") router.push(target);
  }

  async function enablePush() {
    setEnablingPush(true);
    setPushMessage("");
    try {
      // A denied location does not prevent registering this device for push.
      const coordinates = await requestCurrentCoordinates().catch(() => undefined);
      const result = await enableRecoveryPush(coordinates);
      setPushMessage(result.enabled ? "Notifications enabled on this device." : result.reason);
    } catch (cause) {
      setPushMessage(authErrorMessage(cause));
    } finally {
      setEnablingPush(false);
    }
  }

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl accessibilityLabel="Refresh notifications" refreshing={refreshing} onRefresh={() => void refresh()} />
          }
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack("/dashboard")}
              style={styles.iconButton}
            >
              <BackArrow />
            </Pressable>
            <View style={styles.titleRow}>
              <BellIcon size={19} />
              <Text style={styles.screenTitle}>Notifications</Text>
            </View>
          </View>

          <Text style={styles.supporting}>Care, clinic, and recovery activity.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Enable notifications"
            accessibilityState={{ disabled: enablingPush, busy: enablingPush }} disabled={enablingPush}
            onPress={() => void enablePush()} style={styles.pushButton}>
            {enablingPush ? <ActivityIndicator color={Palette.forestDark} /> : <><BellIcon size={17} /><Text style={styles.pushButtonText}>Enable notifications</Text></>}
          </Pressable>
          {pushMessage ? <Text accessibilityLiveRegion="polite" style={styles.supporting}>{pushMessage}</Text> : null}

          {unreadCount ? (
            <Text style={styles.unreadLabel}>
              {unreadCount} unread {unreadCount === 1 ? "notification" : "notifications"}
            </Text>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {loading ? <ActivityIndicator color={Palette.forestDark} style={styles.loader} /> : null}

          {!loading && !error && items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><BellIcon size={24} /></View>
              <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
              <Text style={styles.emptyText}>New notifications will appear here.</Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                accessibilityHint={item.readAt ? "Read notification" : "Unread notification"}
                onPress={() => void openNotification(item)}
                style={({ pressed }) => [
                  styles.card,
                  !item.readAt && styles.cardUnread,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.statusDot, item.readAt && styles.statusDotRead]} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardText}>{item.body}</Text>
                  <Text style={styles.cardTime}>{when(item.createdAt)}</Text>
                </View>
                <ChevronRightIcon size={18} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.cream, alignItems: "center" },
  safeArea: { flex: 1, width: "100%", maxWidth: MaxContentWidth },
  content: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  topBar: { minHeight: 48, marginTop: Spacing.two, flexDirection: "row", alignItems: "center", gap: Spacing.three },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: Palette.borderSoft, backgroundColor: Palette.surface, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  screenTitle: { fontFamily: Fonts.sans, fontSize: 18, fontWeight: "800", color: Palette.forestDark },
  supporting: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21, color: Palette.inkMuted, marginTop: Spacing.two },
  unreadLabel: { alignSelf: "flex-start", marginTop: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 7, borderRadius: 999, overflow: "hidden", backgroundColor: Palette.sage, fontFamily: Fonts.sans, fontSize: 11.5, fontWeight: "800", color: Palette.forestDark },
  loader: { marginTop: Spacing.five },
  error: { fontFamily: Fonts.sans, fontSize: 13, color: Palette.danger, marginTop: Spacing.three },
  list: { gap: Spacing.two, marginTop: Spacing.four },
  card: { minHeight: 86, borderRadius: 17, borderWidth: 1, borderColor: Palette.borderSoft, backgroundColor: Palette.surface, padding: Spacing.three, flexDirection: "row", alignItems: "center", gap: Spacing.three },
  cardUnread: { borderColor: "#96B49A", backgroundColor: "#F6FBF3" },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.gold },
  statusDotRead: { backgroundColor: Palette.borderSoft },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: Fonts.sans, fontSize: 14.5, fontWeight: "800", color: Palette.forestDark },
  cardText: { fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 18, color: Palette.inkMuted, marginTop: 3 },
  cardTime: { fontFamily: Fonts.sans, fontSize: 10.5, color: Palette.placeholder, marginTop: Spacing.two },
  emptyCard: { marginTop: Spacing.five, borderRadius: 18, borderWidth: 1, borderColor: Palette.borderSoft, backgroundColor: Palette.surface, padding: Spacing.five, alignItems: "center" },
  emptyIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: Palette.sage, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: Fonts.sans, fontSize: 18, fontWeight: "800", color: Palette.forestDark, marginTop: Spacing.three },
  emptyText: { fontFamily: Fonts.sans, fontSize: 13, color: Palette.inkMuted, marginTop: Spacing.two, textAlign: "center" },
  pushButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: Spacing.two, alignSelf: "flex-start", marginTop: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: 14, backgroundColor: Palette.sage },
  pushButtonText: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: "700", color: Palette.forestDark },
  pressed: { opacity: 0.82 },
});
