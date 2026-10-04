import { useEffect, useMemo, useRef } from "react";
import MapView, { Marker, Polyline } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import { Palette } from "@/constants/palette";

import type { RecoveryMapPin, RecoveryMapProps } from "./types";

const emptyTrail: NonNullable<RecoveryMapProps["trail"]> = [];

const fallback = {
  latitude: 7.4478,
  longitude: 125.8078,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function colorFor(pin: RecoveryMapPin): string {
  if (pin.kind === "found") return Palette.warning;
  if (pin.kind === "sighting" || pin.status === "SIGHTED") return Palette.gold;
  if (pin.kind === "reunited" || pin.status === "REUNITED")
    return Palette.success;
  if (pin.kind === "nearby") return Palette.nearby;
  return Palette.danger;
}

export function RecoveryMap({
  pins,
  trail = emptyTrail,
  selected,
  onSelect,
  height = 250,
}: RecoveryMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const focus = selected || pins[0] || fallback;
  const coordinates = useMemo(
    () => [
      ...pins.map((pin) => ({
        latitude: pin.latitude,
        longitude: pin.longitude,
      })),
      ...trail,
      ...(selected ? [selected] : []),
    ],
    [pins, selected, trail],
  );

  const coordinateSignature = coordinates
    .map(
      (coordinate) =>
        `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`,
    )
    .join("|");

  useEffect(() => {
    if (coordinates.length < 2) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }, 120);
    return () => clearTimeout(timer);
    // The signature prevents identical parent rerenders from repeatedly
    // re-animating and re-fitting the native map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateSignature]);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: focus.latitude,
          longitude: focus.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        onPress={
          onSelect
            ? (event) => onSelect(event.nativeEvent.coordinate)
            : undefined
        }
      >
        {trail.length >= 2 ? (
          <Polyline
            coordinates={trail}
            strokeColor={Palette.forestDark}
            strokeWidth={4}
          />
        ) : null}
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{
              latitude: pin.latitude,
              longitude: pin.longitude,
            }}
            title={pin.title}
            description={pin.description}
            pinColor={colorFor(pin)}
          />
        ))}
        {selected ? (
          <Marker
            coordinate={selected}
            title="Selected location"
            pinColor={Palette.forestDark}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
  },
});
