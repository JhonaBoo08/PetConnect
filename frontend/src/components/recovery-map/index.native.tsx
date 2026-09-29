import MapView, { Marker } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import type { RecoveryMapProps } from "./types";

const fallback = {
  latitude: 7.4478,
  longitude: 125.8078,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function RecoveryMap({
  pins,
  selected,
  onSelect,
  height = 250,
}: RecoveryMapProps) {
  const focus = selected || pins[0] || fallback;
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
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
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{
              latitude: pin.latitude,
              longitude: pin.longitude,
            }}
            title={pin.title}
            description={pin.description}
          />
        ))}
        {selected ? (
          <Marker
            coordinate={selected}
            title="Selected location"
            pinColor="#F2B632"
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
