import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";

import { Palette } from "@/constants/palette";
import { Fonts } from "@/constants/theme";
import { type AppFeedback, subscribeFeedback } from "@/services/feedback";

export function FeedbackHost() {
  const [feedback, setFeedback] = useState<AppFeedback | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeFeedback((next) => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setFeedback(next);
        opacity.stopAnimation();
        translateY.stopAnimation();
        opacity.setValue(0);
        translateY.setValue(8);

        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(
            next.tone === "error"
              ? Haptics.NotificationFeedbackType.Error
              : Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }

        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 140,
            useNativeDriver: true,
          }),
        ]).start();

        hideTimer.current = setTimeout(
          () => {
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0,
                duration: 160,
                useNativeDriver: true,
              }),
              Animated.timing(translateY, {
                toValue: 6,
                duration: 160,
                useNativeDriver: true,
              }),
            ]).start(({ finished }) => {
              if (finished) setFeedback(null);
            });
          },
          next.tone === "error" ? 4200 : 2600,
        );
      }),
    [opacity, translateY],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!feedback) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          feedback.tone === "error" && styles.toastError,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text style={styles.text}>{feedback.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "web" ? 24 : 94,
    alignItems: "center",
  },
  toast: {
    maxWidth: 440,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    justifyContent: "center",
    backgroundColor: Palette.forestDark,
    elevation: 8,
  },
  toastError: {
    backgroundColor: Palette.danger,
  },
  text: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: Palette.white,
    textAlign: "center",
  },
});
