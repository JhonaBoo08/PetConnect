import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";

import { Palette } from "@/constants/palette";
import { scheduleOnRN } from "react-native-worklets";

const DURATION = 450;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    70: { opacity: 1, transform: [{ scale: 1 }] },
    100: {
      opacity: 0,
      transform: [{ scale: 1.04 }],
      easing: Easing.out(Easing.ease),
    },
  });

  const logo = (
    <Image
      contentFit="contain"
      source={require("@/assets/images/logo.png")}
      style={styles.logo}
    />
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        "worklet";
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.splashOverlay}
    >
      {logo}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={styles.splashOverlay}
    >
      {logo}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 150,
    height: 150,
  },
  splashOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    backgroundColor: Palette.cream,
    justifyContent: "center",
    zIndex: 1000,
  },
});
