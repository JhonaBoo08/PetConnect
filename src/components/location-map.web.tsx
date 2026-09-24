import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { buildLocationMapHtml } from '@/components/location-map-html';
import { Palette } from '@/constants/palette';
import type { GeoPosition, LocationSource } from '@/lib/geolocation';

type LocationMapProps = {
  initial: { latitude: number; longitude: number };
  user: GeoPosition | null;
  onSelect: (latitude: number, longitude: number, source: LocationSource) => void;
  style?: StyleProp<ViewStyle>;
};

export function LocationMap({ initial, user, onSelect, style }: LocationMapProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const html = useMemo(
    () => buildLocationMapHtml(initial.latitude, initial.longitude),
    [initial.latitude, initial.longitude],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (
          data &&
          data.type === 'select' &&
          typeof data.latitude === 'number' &&
          typeof data.longitude === 'number'
        ) {
          onSelectRef.current(
            data.latitude,
            data.longitude,
            data.source ?? 'manual_map_selection',
          );
        }
      } catch {
        // Ignore unrelated or malformed window messages.
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const sendUser = useCallback(() => {
    const current = userRef.current;
    const frame = frameRef.current;
    if (!current || !frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({
        type: 'setUser',
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: current.accuracy,
        recenter: true,
      }),
      '*',
    );
  }, []);

  useEffect(() => {
    sendUser();
  }, [user, sendUser]);

  return (
    <View style={[styles.wrap, style]}>
      <iframe
        ref={frameRef}
        title="Last seen location map"
        srcDoc={html}
        onLoad={sendUser}
        style={{ border: '0', width: '100%', height: '100%', display: 'block' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 240,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Palette.goldTrack,
  },
});
