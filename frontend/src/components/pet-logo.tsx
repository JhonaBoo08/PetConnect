import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

type PetSlotProps = {
  size?: number;
  color?: string;
};

export function PetLogoSilhouette({ size = 96, color = '#1B4332' }: PetSlotProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill={color}>
      <Path d="M26 62 Q26 55 34 54 L50 54 Q56 54 58 62 L58 112 L22 112 Z" />
      <Circle cx={38} cy={44} r={16} />
      <Path d="M24 40 C14 34 12 18 22 16 C30 14 34 26 30 38 Z" />
      <Circle cx={53} cy={46} r={8.5} />

      <Path d="M94 60 Q94 54 86 53 L70 53 Q64 53 62 61 L62 112 L98 112 Z" />
      <Circle cx={82} cy={43} r={14} />
      <Polygon points="70,33 66,14 82,24" />
      <Polygon points="84,22 92,12 98,30" />

      <Path d="M60 68 C50 59 45 54 45 48 C45 43 50 39 60 46 C70 39 75 43 75 48 C75 54 70 59 60 68 Z" />
    </Svg>
  );
}

export function FinderIcon({ size = 18, color = '#1B4332' }: PetSlotProps) {
  const cell = 7;
  const gap = 2;
  const offset = (24 - cell * 2 - gap) / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={offset} y={offset} width={cell} height={cell} rx={2} fill={color} />
      <Rect x={offset + cell + gap} y={offset} width={cell} height={cell} rx={2} fill={color} />
      <Rect x={offset} y={offset + cell + gap} width={cell} height={cell} rx={2} fill={color} />
      <Rect
        x={offset + cell + gap}
        y={offset + cell + gap}
        width={cell}
        height={cell}
        rx={2}
        fill={color}
      />
    </Svg>
  );
}