import { StyleSheet, View, type DimensionValue } from "react-native";

import { Palette } from "@/constants/palette";
import { Spacing } from "@/constants/theme";

export function SkeletonBlock({
  height = 16,
  width = "100%",
  radius = 10,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { height, width, borderRadius: radius }]}
    />
  );
}

export function ListSkeleton({
  rows = 3,
  rowHeight = 72,
}: {
  rows?: number;
  rowHeight?: number;
}) {
  return (
    <View
      accessibilityLabel="Loading content"
      accessibilityRole="progressbar"
      style={styles.list}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.row, { minHeight: rowHeight }]}>
          <SkeletonBlock width={48} height={48} radius={14} />
          <View style={styles.copy}>
            <SkeletonBlock width="48%" height={14} />
            <SkeletonBlock width="72%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Palette.borderSoft,
    opacity: 0.62,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: Spacing.two,
  },
});
