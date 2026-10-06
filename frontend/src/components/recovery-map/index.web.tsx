import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { Palette } from "@/constants/palette";
import type { RecoveryMapPin, RecoveryMapProps } from "./types";

const emptyTrail: NonNullable<RecoveryMapProps["trail"]> = [];

function colorFor(pin: RecoveryMapPin): string {
  if (pin.kind === "found") return Palette.warning;
  if (pin.kind === "sighting" || pin.status === "SIGHTED") return Palette.gold;
  if (pin.kind === "reunited" || pin.status === "REUNITED")
    return Palette.success;
  if (pin.kind === "nearby") return Palette.nearby;
  return Palette.danger;
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
  trail = emptyTrail,
  selected,
  onSelect,
  height = 250,
}: RecoveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  const pinsRef = useRef(pins);
  const trailRef = useRef(trail);
  const selectedRef = useRef(selected);
  const renderDataRef = useRef<(() => void) | null>(null);

  onSelectRef.current = onSelect;
  pinsRef.current = pins;
  trailRef.current = trail;
  selectedRef.current = selected;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let handleContainerClick: ((event: MouseEvent) => void) | null = null;

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

      const dynamicLayers = L.layerGroup().addTo(map);

      const renderData = () => {
        if (!map) return;
        dynamicLayers.clearLayers();
        const points: [number, number][] = [];

        const trailPoints = trailRef.current
          .filter(
            (point) =>
              Number.isFinite(point.latitude) &&
              Number.isFinite(point.longitude),
          )
          .map(
            (point) => [point.latitude, point.longitude] as [number, number],
          );

        if (trailPoints.length >= 2) {
          L.polyline(trailPoints, {
            color: Palette.forestDark,
            weight: 4,
            opacity: 0.85,
          }).addTo(dynamicLayers);
          points.push(...trailPoints);
        }

        for (const pin of pinsRef.current) {
          if (
            !Number.isFinite(pin.latitude) ||
            !Number.isFinite(pin.longitude)
          ) {
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
            .addTo(dynamicLayers)
            .bindPopup(popup(pin.title, pin.description));
        }

        const selectedPoint = selectedRef.current;
        if (selectedPoint) {
          const coordinate: [number, number] = [
            selectedPoint.latitude,
            selectedPoint.longitude,
          ];
          points.push(coordinate);
          L.circleMarker(coordinate, {
            radius: 10,
            color: "#FFFFFF",
            weight: 3,
            fillColor: Palette.forestDark,
            fillOpacity: 1,
          })
            .addTo(dynamicLayers)
            .bindPopup(popup("Selected location"));
        }

        if (points.length === 1) {
          map.setView(points[0], 15, { animate: false });
        } else if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points), {
            padding: [28, 28],
            maxZoom: 16,
            animate: false,
          });
        } else {
          map.setView([7.4478, 125.8078], 12, { animate: false });
        }
      };

      renderDataRef.current = renderData;
      renderData();

      handleContainerClick = (event: MouseEvent) => {
        if (!map || !onSelectRef.current) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(".leaflet-control, .leaflet-popup")
        ) {
          return;
        }

        const coordinate = map.mouseEventToLatLng(event);
        onSelectRef.current({
          latitude: coordinate.lat,
          longitude: coordinate.lng,
        });
      };
      container.addEventListener("click", handleContainerClick, true);

      requestAnimationFrame(() => map?.invalidateSize());
    });

    return () => {
      cancelled = true;
      renderDataRef.current = null;
      if (handleContainerClick) {
        container.removeEventListener("click", handleContainerClick, true);
      }
      map?.remove();
    };
  }, []);

  useEffect(() => {
    renderDataRef.current?.();
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
