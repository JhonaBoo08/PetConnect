import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export type GeoErrorCode =
  | 'permission'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export type LocationSource = 'device_geolocation' | 'manual_map_selection';

export class GeoError extends Error {
  code: GeoErrorCode;

  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = 'GeoError';
    this.code = code;
  }
}

export const geolocationOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
} as const;

const MESSAGES: Record<GeoErrorCode, string> = {
  permission:
    'Location permission was denied. Please allow location access in your browser/device settings.',
  unavailable:
    'Your location is currently unavailable. Please check your device location services.',
  timeout: 'Getting your location took too long. Please try again.',
  unsupported:
    "We couldn't get your location. Please try again or select the location manually on the map.",
  unknown:
    "We couldn't get your location. Please try again or select the location manually on the map.",
};

export function geolocationErrorMessage(error: unknown): string {
  if (error instanceof GeoError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return MESSAGES.unknown;
}

function webErrorCode(code: number): GeoErrorCode {
  switch (code) {
    case 1:
      return 'permission';
    case 2:
      return 'unavailable';
    case 3:
      return 'timeout';
    default:
      return 'unknown';
  }
}

function getWebPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoError('unsupported', MESSAGES.unsupported));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          timestamp: position.timestamp || Date.now(),
        });
      },
      (error) => {
        const code = webErrorCode(error.code);
        reject(new GeoError(code, MESSAGES[code]));
      },
      geolocationOptions,
    );
  });
}

async function getNativePosition(): Promise<GeoPosition> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new GeoError('permission', MESSAGES.permission);
  }
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      timestamp: position.timestamp || Date.now(),
    };
  } catch (error) {
    throw new GeoError('unavailable', geolocationErrorMessage(error));
  }
}

export async function getCurrentDevicePosition(): Promise<GeoPosition> {
  if (Platform.OS === 'web') return getWebPosition();
  return getNativePosition();
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1' +
      `&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { display_name?: unknown };
    if (typeof data.display_name === 'string' && data.display_name.trim()) {
      return data.display_name.trim();
    }
    return null;
  } catch {
    return null;
  }
}

type Coordinates = { latitude: number; longitude: number };

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  const km = earthRadiusKm * arc;
  return Number.isFinite(km) ? km : 0;
}

export function formatDistanceKm(km: number): string {
  if (km < 0.1) return `${Math.max(10, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

export function formatAccuracy(accuracy: number | null): string | null {
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  return `Accuracy: approximately ${Math.round(accuracy)} meters`;
}
