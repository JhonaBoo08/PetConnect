import qrcode from "qrcode-generator";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Palette } from "@/constants/palette";

function qrPath(seed: string, size: number) {
  const code = qrcode(0, "M");
  code.addData(seed, "Byte");
  code.make();

  const grid = code.getModuleCount();
  const cell = size / grid;
  let d = "";
  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      if (code.isDark(r, c)) {
        const x = (c * cell).toFixed(2);
        const y = (r * cell).toFixed(2);
        const s = cell.toFixed(2);
        d += `M${x} ${y}h${s}v${s}h-${s}z`;
      }
    }
  }
  return d;
}

export function QrCode({ seed, size = 72 }: { seed: string; size?: number }) {
  const pad = size * 0.08;
  const inner = size - pad * 2;
  return (
    <View style={[styles.qrWrap, { width: size, height: size }]}>
      <Svg width={inner} height={inner} viewBox={`0 0 ${inner} ${inner}`}>
        <Path d={qrPath(seed, inner)} fill={Palette.forestDark} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    backgroundColor: Palette.surface,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
