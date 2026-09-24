import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

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
  const webRef = useRef<WebView>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const html = useMemo(
    () => buildLocationMapHtml(initial.latitude, initial.longitude),
    [initial.latitude, initial.longitude],
  );

  const sendUser = useCallback(() => {
    const current = userRef.current;
    if (!current) return;
    const accuracy = current.accuracy ?? 'null';
    webRef.current?.injectJavaScript(
      `window.setUserLocation && window.setUserLocation(${current.latitude}, ${current.longitude}, ${accuracy}, true); true;`,
    );
  }, []);

  useEffect(() => {
    sendUser();
  }, [user, sendUser]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        latitude?: number;
        longitude?: number;
        source?: LocationSource;
      };
      if (
        data.type === 'select' &&
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number'
      ) {
        onSelect(data.latitude, data.longitude, data.source ?? 'manual_map_selection');
      }
    } catch {
      // Ignore malformed bridge messages.
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        onLoadEnd={sendUser}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        setSupportMultipleWindows={false}
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
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
