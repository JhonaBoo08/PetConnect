import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { Palette } from "@/constants/palette";
import type { RecoveryMapPin, RecoveryMapProps } from "./types";

function colorFor(pin: RecoveryMapPin): string {
  if (pin.kind === "found") return "#C78300";
  if (pin.kind === "sighting" || pin.status === "SIGHTED") return "#E0A11B";
  if (pin.kind === "reunited" || pin.status === "REUNITED") return "#3F7D54";
  if (pin.kind === "nearby") return "#5C7A61";
  return "#B74B3E";
}

function popup(title: string, description?: string) {
  const root = document.createElement("div");
  root.style.maxWidth = "220px";
  const heading = document.createElement("strong");
  heading.textContent = title;
  root.appendChild(heading);
  if (description) {
    const body = document.createElement("div");
    body.textContent = description;
    body.style.marginTop = "4px";
    root.appendChild(body);
  }
  return root;
}

export function RecoveryMap({
  pins,
  trail = [],
  selected,
  onSelect,
  height = 250,
}: RecoveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !container) return;
      const L = leaflet.default ?? leaflet;
      map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const points: [number, number][] = [];

      const trailPoints = trail
        .filter(
          (point) =>
            Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
        )
        .map((point) => [point.latitude, point.longitude] as [number, number]);

      if (trailPoints.length >= 2) {
        L.polyline(trailPoints, {
          color: "#2F6F4E",
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
        points.push(...trailPoints);
      }

      for (const pin of pins) {
        if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) {
          continue;
        }
        const coordinate: [number, number] = [pin.latitude, pin.longitude];
        points.push(coordinate);
        L.circleMarker(coordinate, {
          radius: pin.kind === "found" ? 10 : 8,
          color: "#FFFFFF",
          weight: 2,
          fillColor: colorFor(pin),
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(popup(pin.title, pin.description));
      }

      if (selected) {
        const coordinate: [number, number] = [
          selected.latitude,
          selected.longitude,
        ];
        points.push(coordinate);
        L.circleMarker(coordinate, {
          radius: 10,
          color: "#FFFFFF",
          weight: 3,
          fillColor: "#2F6F4E",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(popup("Selected location"));
      }

      if (points.length === 1) {
        map.setView(points[0], 15);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), {
          padding: [28, 28],
          maxZoom: 16,
        });
      } else {
        map.setView([7.4478, 125.8078], 12);
      }

      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        onSelectRef.current?.({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      });

      // Leaflet measures its container during initialization. Expo web can finish
      // layout a frame later, so invalidate once more after the element settles.
      requestAnimationFrame(() => map?.invalidateSize());
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins, selected, trail]);

  return (
    <View style={[styles.wrap, { height }]}>
      <div
        ref={containerRef}
        aria-label="Interactive recovery map"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
});
