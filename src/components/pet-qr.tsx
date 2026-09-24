import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Palette } from '@/constants/palette';

const QR_GRID = 21;

function buildQrMatrix(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const random = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) % 1000) / 1000;
  };
  const cells: boolean[][] = [];
  for (let r = 0; r < QR_GRID; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < QR_GRID; c += 1) {
      row.push(random() > 0.5);
    }
    cells.push(row);
  }
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        cells[r0 + r][c0 + c] = edge || core;
      }
    }
  };
  finder(0, 0);
  finder(0, QR_GRID - 7);
  finder(QR_GRID - 7, 0);
  return cells;
}

function qrPath(seed: string, size: number) {
  const matrix = buildQrMatrix(seed);
  const cell = size / QR_GRID;
  let d = '';
  for (let r = 0; r < QR_GRID; r += 1) {
    for (let c = 0; c < QR_GRID; c += 1) {
      if (matrix[r][c]) {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});