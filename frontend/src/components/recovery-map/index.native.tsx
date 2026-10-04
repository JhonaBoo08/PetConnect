import { useEffect, useMemo, useRef } from "react";
import MapView, { Marker, Polyline } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import type { RecoveryMapPin, RecoveryMapProps } from "./types";

const fallback = {
  latitude: 7.4478,
  longitude: 125.8078,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function colorFor(pin: RecoveryMapPin): string {
  if (pin.kind === "found") return "#C78300";
  if (pin.kind === "sighting" || pin.status === "SIGHTED") return "#E0A11B";
  if (pin.kind === "reunited" || pin.status === "REUNITED") return "#3F7D54";
  if (pin.kind === "nearby") return "#5C7A61";
  return "#B74B3E";
}

export function RecoveryMap({
  pins,
  trail = [],
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

  useEffect(() => {
    if (coordinates.length < 2) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [coordinates]);

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
          <Polyline coordinates={trail} strokeColor="#2F6F4E" strokeWidth={4} />
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
            pinColor="#2F6F4E"
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
