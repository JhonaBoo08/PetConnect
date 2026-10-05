export type RecoveryMapPinKind =
  "lost" | "sighting" | "found" | "reunited" | "nearby";

export type RecoveryMapPin = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  status?: "LOST" | "SIGHTED" | "REUNITED";
  kind?: RecoveryMapPinKind;
};

export type RecoveryMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type RecoveryMapProps = {
  pins: RecoveryMapPin[];
  trail?: RecoveryMapCoordinate[];
  selected?: RecoveryMapCoordinate | null;
  onSelect?: (coordinate: RecoveryMapCoordinate) => void;
  height?: number;
};
