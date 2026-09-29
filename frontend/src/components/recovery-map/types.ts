export type RecoveryMapPin = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  status?: "LOST" | "SIGHTED" | "REUNITED";
};

export type RecoveryMapProps = {
  pins: RecoveryMapPin[];
  selected?: { latitude: number; longitude: number } | null;
  onSelect?: (coordinate: { latitude: number; longitude: number }) => void;
  height?: number;
};
