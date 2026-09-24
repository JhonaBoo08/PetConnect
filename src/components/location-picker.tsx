import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CheckIcon, PinIcon } from '@/components/app-icons';
import { LocationMap } from '@/components/location-map';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import {
  formatAccuracy,
  geolocationErrorMessage,
  getCurrentDevicePosition,
  reverseGeocode,
  type GeoPosition,
  type LocationSource,
} from '@/lib/geolocation';
import type { SelectedLocation } from '@/lib/lost-pets';

type LocationPickerProps = {
  petName: string;
  initial: SelectedLocation | null;
  onConfirm: (location: SelectedLocation) => void;
  onClose: () => void;
};

type Point = { latitude: number; longitude: number };

export function LocationPicker({ petName, initial, onConfirm, onClose }: LocationPickerProps) {
  const [userPosition, setUserPosition] = useState<GeoPosition | null>(null);
  const [marker, setMarker] = useState<Point | null>(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : null,
  );
  const [source, setSource] = useState<LocationSource>(initial?.source ?? 'device_geolocation');
  const [address, setAddress] = useState<string | null>(initial?.address ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mapInitialRef = useRef<Point | null>(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : null,
  );

  const requestLocation = useCallback(async (useAsMarker: boolean) => {
    setStatus('loading');
    setError(null);
    try {
      const position = await getCurrentDevicePosition();
      setUserPosition(position);
      if (!mapInitialRef.current) {
        mapInitialRef.current = { latitude: position.latitude, longitude: position.longitude };
      }
      if (useAsMarker) {
        setMarker({ latitude: position.latitude, longitude: position.longitude });
        setSource('device_geolocation');
      }
      setStatus('ready');
    } catch (caught) {
      setStatus('error');
      setError(geolocationErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    requestLocation(!initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markerLat = marker?.latitude;
  const markerLng = marker?.longitude;

  useEffect(() => {
    if (markerLat === undefined || markerLng === undefined) return;
    let cancelled = false;
    setGeocoding(true);
    const handle = setTimeout(async () => {
      const result = await reverseGeocode(markerLat, markerLng);
      if (cancelled) return;
      setAddress(result);
      setGeocoding(false);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [markerLat, markerLng]);

  const handleSelect = (latitude: number, longitude: number, nextSource: LocationSource) => {
    setMarker({ latitude, longitude });
    setSource(nextSource);
  };

  const confirm = async () => {
    if (!marker) return;
    setSubmitting(true);
    let finalAddress = address;
    if (!finalAddress) {
      finalAddress = await reverseGeocode(marker.latitude, marker.longitude);
    }
    onConfirm({
      latitude: marker.latitude,
      longitude: marker.longitude,
      accuracy: source === 'device_geolocation' ? (userPosition?.accuracy ?? null) : null,
      address: finalAddress,
      source,
      updatedAt: Date.now(),
    });
    setSubmitting(false);
  };

  const mapInitial = mapInitialRef.current;
  const loading = status === 'loading';
  const canConfirm = Boolean(marker) && !loading && !submitting;

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Pin exact location</Text>
          <Text style={styles.hint}>Where was {petName || 'your pet'} last seen?</Text>

          <View style={styles.mapWrap}>
            {mapInitial ? (
              <LocationMap
                initial={mapInitial}
                user={userPosition}
                onSelect={handleSelect}
                style={styles.map}
              />
            ) : (
              <View style={styles.mapLoading}>
                {loading ? (
                  <>
                    <ActivityIndicator color={Palette.forestDark} />
                    <Text style={styles.mapLoadingText}>Getting your current location…</Text>
                  </>
                ) : (
                  <Text style={styles.mapLoadingText}>Tap the map to select a location.</Text>
                )}
              </View>
            )}
          </View>

          {loading ? (
            <View style={styles.infoRow}>
              <ActivityIndicator color={Palette.forestDark} />
              <Text style={styles.infoHint}>Getting your current location…</Text>
            </View>
          ) : userPosition ? (
            <View style={styles.infoRow}>
              <View style={styles.infoDot} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Current location detected</Text>
                <Text style={styles.infoHint}>
                  {formatAccuracy(userPosition.accuracy) ?? 'Accuracy unavailable'}
                </Text>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => requestLocation(!marker)}
                style={({ pressed }) => [styles.tryAgainButton, pressed && styles.pressed]}>
                <Text style={styles.tryAgainLabel}>Try Again</Text>
              </Pressable>
            </View>
          ) : null}

          {marker ? (
            <View style={styles.selectedRow}>
              <PinIcon size={16} color={Palette.forestDark} />
              <Text style={styles.selectedText} numberOfLines={2}>
                {geocoding ? 'Locating address…' : (address ?? 'Location selected')}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => requestLocation(true)}
            disabled={loading}
            style={({ pressed }) => [
              styles.currentButton,
              (pressed || loading) && styles.pressed,
            ]}>
            <PinIcon size={16} color={Palette.forestDark} />
            <Text style={styles.currentLabel}>Use my current location</Text>
          </Pressable>

          <Text style={styles.privacy}>
            Your location is used to identify where the pet was last seen and help nearby
            Pet-Connect members find them.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={confirm}
            disabled={!canConfirm}
            style={({ pressed }) => [
              styles.confirmButton,
              (!canConfirm || pressed) && styles.pressed,
            ]}>
            <CheckIcon size={16} color={Palette.forestDark} />
            <Text style={styles.confirmLabel}>Confirm location</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20,40,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: Palette.cream,
    borderRadius: 18,
    overflow: 'hidden',
  },
  sheetContent: {
    padding: Spacing.four,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  mapWrap: {
    marginTop: Spacing.four,
    borderRadius: 14,
    overflow: 'hidden',
  },
  map: {
    height: 240,
  },
  mapLoading: {
    height: 240,
    borderRadius: 14,
    backgroundColor: Palette.goldTrack,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  mapLoadingText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  infoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.forestDark,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  infoHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
  },
  errorCard: {
    marginTop: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.danger,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.danger,
  },
  tryAgainButton: {
    alignSelf: 'flex-start',
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryAgainLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  selectedText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
  },
  currentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    marginTop: Spacing.three,
  },
  currentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  privacy: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
    marginTop: Spacing.three,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.three,
  },
  confirmLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    marginTop: Spacing.two,
  },
  cancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
