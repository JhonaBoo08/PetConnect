import { StyleSheet, Text, View } from "react-native";

import { Palette } from "@/constants/palette";
import { Fonts, Spacing } from "@/constants/theme";
import type { RecoveryMapProps } from "./types";

export function RecoveryMap({
  pins,
  selected,
  onSelect,
  height = 250,
}: RecoveryMapProps) {
  const visible = selected
    ? [
        {
          id: "selected",
          latitude: selected.latitude,
          longitude: selected.longitude,
          title: "Selected location",
        },
        ...pins,
      ]
    : pins;

  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      <Text style={styles.title}>Recovery map</Text>
      <Text style={styles.help}>
        Interactive map selection is available in the iOS/Android app. GPS
        coordinates and nearby-distance matching still work on web.
      </Text>
      {visible.slice(0, 5).map((pin) => (
        <View key={pin.id} style={styles.pinRow}>
          <Text style={styles.pinTitle}>{pin.title}</Text>
          <Text style={styles.coords}>
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </Text>
        </View>
      ))}
      {onSelect ? (
        <Text style={styles.help}>
          Use “Use my GPS” to set the report location on web.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  help: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  pinRow: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderSoft,
    paddingTop: Spacing.two,
  },
  pinTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  coords: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Palette.inkMuted,
  },
});
