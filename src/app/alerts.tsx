import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrow,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PawIcon,
  PinIcon,
  SendIcon,
  UploadIcon,
} from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  activeNearbyAlerts,
  createLostPetAlert,
  currentOwnerId,
  distanceFromReference,
  getLostPetAlertsSync,
  type LostPetAlert,
  type PinnedLocation,
  tagumLocations,
  timeAgo,
  updateLostPetAlert,
  useLostPetAlerts,
} from '@/lib/lost-pets';
import { goBack } from '@/lib/navigation';
import { addNotification } from '@/lib/notifications';
import { petAge, usePets } from '@/lib/pets';

function PhotoFrame({ photo, size }: { photo: string; size: number }) {
  return photo ? (
    <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: 10 }} contentFit="cover" />
  ) : (
    <View style={[styles.photoThumb, { width: size, height: size }]}>
      <PawIcon size={size * 0.5} color={Palette.forestDark} />
    </View>
  );
}

function FeedCard({
  alert,
  onPress,
}: {
  alert: LostPetAlert;
  onPress: () => void;
}) {
  const distance = distanceFromReference(alert.latitude, alert.longitude);
  const photo = alert.photoUrl || alert.petPhoto;
  const isLost = alert.reportKind === 'Lost';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.feedCard, pressed && styles.pressed]}>
      <View style={styles.feedPhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.feedPhotoImage} contentFit="cover" />
        ) : (
          <PawIcon size={26} color={Palette.forestDark} />
        )}
      </View>
      <View style={styles.feedBody}>
        <View style={styles.feedTopRow}>
          <Text style={styles.feedName}>{alert.petName}</Text>
          <View style={[styles.feedPill, isLost ? styles.feedPillLost : styles.feedPillFound]}>
            <Text style={styles.feedPillText}>{alert.reportKind}</Text>
          </View>
        </View>
        <Text style={styles.feedLocation}>
          Near {alert.locationName}
          {distance !== null ? ` · ${distance} km away` : ''}
        </Text>
        <Text style={styles.feedTime}>Posted {timeAgo(alert.createdAt)}</Text>
        {alert.description ? (
          <Text style={styles.feedDescription}>{alert.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function PinSheet({
  petName,
  onClose,
  onSelect,
}: {
  petName: string;
  onClose: () => void;
  onSelect: (location: PinnedLocation) => void;
}) {
  const [custom, setCustom] = useState('');
  const choosePreset = (location: (typeof tagumLocations)[number]) => {
    onSelect({
      latitude: location.latitude,
      longitude: location.longitude,
      name: `${location.name}, Tagum City`,
    });
  };
  const chooseCustom = () => {
    if (custom.trim()) {
      onSelect({ latitude: null, longitude: null, name: custom.trim() });
    }
  };
  return (
    <View style={styles.overlay}>
      <View style={styles.pinSheet}>
        <Text style={styles.pinTitle}>Pin exact location</Text>
        <Text style={styles.pinHint}>Where was {petName || 'your pet'} last seen?</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Suggested nearby places"
          style={styles.mapPanel}>
          <PinIcon size={30} color={Palette.forestDark} />
          <Text style={styles.mapPanelTitle}>Tagum City</Text>
          <Text style={styles.mapPanelHint}>Choose a suggested place or enter a custom spot.</Text>
        </Pressable>

        <Text style={styles.pinSectionLabel}>SUGGESTED NEARBY</Text>
        <View style={styles.pinList}>
          {tagumLocations.map((location) => (
            <Pressable
              key={location.name}
              accessibilityRole="button"
              onPress={() => choosePreset(location)}
              style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}>
              <PinIcon size={16} color={Palette.forestDark} />
              <Text style={styles.pinOptionLabel}>{location.name}</Text>
              <Text style={styles.pinOptionArea}>{location.area}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.pinSectionLabel}>CUSTOM LOCATION</Text>
        <TextInput
          value={custom}
          onChangeText={setCustom}
          placeholder="Describe a nearby landmark or street"
          placeholderTextColor={Palette.placeholder}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPress={chooseCustom}
          disabled={!custom.trim()}
          style={({ pressed }) => [
            styles.pinCustomButton,
            (!custom.trim() || pressed) && styles.pressed,
          ]}>
          <CheckIcon />
          <Text style={styles.pinCustomLabel}>Use this location</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const editParam = Array.isArray(params.edit) ? params.edit[0] : (params.edit ?? '');
  const pets = usePets();
  const alerts = useLostPetAlerts();
  const editingAlert = alerts.find((a) => a.id === editParam) ?? null;

  const [mode, setMode] = useState<'report' | 'feed'>('report');
  const [petOpen, setPetOpen] = useState(false);
  const [petId, setPetId] = useState(() =>
    editingAlert
      ? editingAlert.petId
      : (getLostPetAlertsSync().find((a) => a.id === editParam)?.petId ?? ''),
  );
  const [lastSeen, setLastSeen] = useState(() =>
    editingAlert
      ? editingAlert.lastSeenDescription
      : (getLostPetAlertsSync().find((a) => a.id === editParam)?.lastSeenDescription ?? ''),
  );
  const [location, setLocation] = useState<PinnedLocation | null>(() => {
    const target = editingAlert ?? getLostPetAlertsSync().find((a) => a.id === editParam);
    return target
      ? {
          latitude: target.latitude,
          longitude: target.longitude,
          name: target.locationName,
        }
      : null;
  });
  const [details, setDetails] = useState(() =>
    editingAlert
      ? editingAlert.description
      : (getLostPetAlertsSync().find((a) => a.id === editParam)?.description ?? ''),
  );
  const [photoOverride, setPhotoOverride] = useState(() =>
    editingAlert
      ? editingAlert.photoUrl
      : (getLostPetAlertsSync().find((a) => a.id === editParam)?.photoUrl ?? ''),
  );
  const [errors, setErrors] = useState<{ pet?: string; lastSeen?: string; pin?: string }>({});
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishedAlert, setPublishedAlert] = useState<LostPetAlert | null>(null);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!editParam || !editingAlert || hydratedRef.current) return;
    hydratedRef.current = true;
    setPetId(editingAlert.petId);
    setLastSeen(editingAlert.lastSeenDescription);
    setLocation({
      latitude: editingAlert.latitude,
      longitude: editingAlert.longitude,
      name: editingAlert.locationName,
    });
    setDetails(editingAlert.description);
    setPhotoOverride(editingAlert.photoUrl);
  }, [editParam, editingAlert]);

  const selectedPet = pets.find((p) => p.id === petId) ?? null;
  const photo = photoOverride || selectedPet?.photo || '';
  const photoLabel = photoOverride ? 'Pinned photo' : selectedPet?.photo ? 'Pet profile photo' : '';

  const clearError = (key: 'pet' | 'lastSeen' | 'pin') =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.base64) {
        setPhotoOverride(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
      } else {
        setPhotoOverride(asset.uri);
      }
    } catch {
      // Photo selection is optional; keep the previous state on failure.
    }
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!petId) next.pet = 'Please select a pet.';
    if (!lastSeen.trim()) next.lastSeen = 'Please enter where your pet was last seen.';
    if (!location) next.pin = 'Please pin the last known location.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const publish = () => {
    if (!validate()) return;
    setConfirmOpen(true);
  };

  const onConfirm = async () => {
    if (!petId || !location) return;
    setBusy(true);
    try {
      const base = {
        petId,
        ownerId: currentOwnerId(),
        petName: selectedPet?.name ?? editingAlert?.petName ?? 'Pet',
        petPhoto: selectedPet?.photo ?? '',
        lastSeenDescription: lastSeen.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        locationName: location.name,
        description: details.trim(),
        photoUrl: photo,
        reportKind: 'Lost' as const,
      };
      if (editingAlert) {
        const updated = await updateLostPetAlert(editingAlert.id, base);
        setPublishedAlert(updated);
      } else {
        const created = await createLostPetAlert(base);
        await addNotification({
          id: `ntf-lost-${created.id}`,
          kind: 'lost-pet',
          title: 'Lost pet nearby',
          description: `${created.petName} was reported lost near ${created.locationName}.`,
          timestamp: 'Just now',
          route: { pathname: '/alert-details', params: { id: created.id } },
        });
        setPublishedAlert(created);
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const dirty = Boolean(
    petId ||
      lastSeen.trim() ||
      location ||
      details.trim() ||
      photoOverride,
  );

  const onBack = () => {
    if (dirty && !editingAlert) {
      setDiscardOpen(true);
      return;
    }
    goBack('/dashboard');
  };

  if (publishedAlert) {
    const isEdit = Boolean(editingAlert);
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.confirmWrap}>
            <View style={styles.confirmIcon}>
              <CheckIcon size={28} color={Palette.white} />
            </View>
            <Text style={styles.confirmTitle}>
              {isEdit ? 'Lost pet alert updated' : 'Lost pet alert published'}
            </Text>
            <Text style={styles.confirmText}>
              {isEdit
                ? 'Your changes were saved to the lost-pet alert.'
                : 'Nearby Pet-Connect members and clinics can now see your report.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const id = publishedAlert.id;
                setPublishedAlert(null);
                setMode('feed');
                router.push({ pathname: '/alert-details', params: { id } });
              }}
              style={({ pressed }) => [styles.publishButton, styles.confirmButton, pressed && styles.pressed]}>
              <Text style={styles.publishLabel}>View my alert</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPublishedAlert(null);
                router.navigate('/dashboard');
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Return home</Text>
            </Pressable>
          </View>

          <BottomNav active="alerts" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={styles.iconButton}>
              <BellIcon />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <Text style={styles.category}>RECOVERY NETWORK</Text>
          <Text style={styles.heading}>Lost &amp; Found</Text>
          <Text style={styles.supporting}>
            Alert nearby Pet-Connect members and clinics quickly.
          </Text>

          <View style={styles.segment}>
            {(['report', 'feed'] as const).map((key) => {
              const isActive = mode === key;
              const label = key === 'report' ? 'Report lost' : 'Nearby feed';
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setMode(key)}
                  style={[styles.segmentItem, isActive && styles.segmentItemActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'report' ? (
            <>
              <Text style={styles.label}>Pet</Text>
              {editingAlert ? (
                <View style={[styles.input, styles.fieldRow]}>
                  <Text style={styles.inputText}>
                    {selectedPet
                      ? `${selectedPet.name} · ${selectedPet.breed}`
                      : editingAlert.petName}
                  </Text>
                </View>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPetOpen((open) => !open)}
                    style={[styles.input, styles.fieldRow, errors.pet ? styles.inputInvalid : null]}>
                    <Text style={[styles.inputText, !selectedPet && styles.placeholderText]}>
                      {selectedPet
                        ? `${selectedPet.name} · ${selectedPet.breed} · ${petAge(selectedPet)}`
                        : 'Select a pet'}
                    </Text>
                    <ChevronDownIcon />
                  </Pressable>
                  {petOpen ? (
                    <View style={styles.dropdown}>
                      {pets.map((option) => (
                        <Pressable
                          key={option.id}
                          accessibilityRole="button"
                          onPress={() => {
                            setPetId(option.id);
                            setPhotoOverride('');
                            setPetOpen(false);
                            setErrors((prev) => ({ ...prev, pet: undefined }));
                          }}
                          style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}>
                          <PawIcon size={18} color={Palette.forestDark} />
                          <Text style={styles.dropdownLabel}>
                            {option.name} · {option.breed} · {petAge(option)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {errors.pet ? <Text style={styles.error}>{errors.pet}</Text> : null}
                </>
              )}

              <Text style={styles.label}>Last seen</Text>
              <TextInput
                value={lastSeen}
                onChangeText={(value) => {
                  setLastSeen(value);
                  if (value.trim()) clearError('lastSeen');
                }}
                placeholder="e.g. Freedom Park, Tagum"
                placeholderTextColor={Palette.placeholder}
                style={[styles.input, errors.lastSeen ? styles.inputInvalid : null]}
              />
              {errors.lastSeen ? <Text style={styles.error}>{errors.lastSeen}</Text> : null}

              <Text style={styles.label}>Pin exact location</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPinOpen(true);
                  clearError('pin');
                }}
                style={[
                  styles.locationBox,
                  location ? styles.locationBoxPinned : null,
                  errors.pin ? styles.locationBoxInvalid : null,
                ]}>
                {location ? (
                  <View style={styles.locationRow}>
                    <View style={styles.locationCheck}>
                      <CheckIcon size={14} color={Palette.white} />
                    </View>
                    <View style={styles.locationText}>
                      <Text style={styles.locationTitle}>Pinned · {location.name}</Text>
                      <Text style={styles.locationHint}>Tap to change pin</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <PinIcon size={26} />
                    <Text style={styles.locationTitle}>Tap to pin location</Text>
                    <Text style={styles.locationHint}>Pin where you last saw your pet.</Text>
                  </>
                )}
              </Pressable>
              {errors.pin ? <Text style={styles.error}>{errors.pin}</Text> : null}

              <Text style={styles.label}>What should people know?</Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Collar, behavior, identifying marks..."
                placeholderTextColor={Palette.placeholder}
                style={[styles.input, styles.textArea]}
                multiline
              />

              {photo ? (
                <View style={styles.photoPreview}>
                  <PhotoFrame photo={photo} size={44} />
                  <View style={styles.photoText}>
                    <Text style={styles.photoName}>
                      {photoLabel || 'Current photo'}
                    </Text>
                    {photoLabel ? (
                      <Text style={styles.photoHint}>Used in your alert</Text>
                    ) : null}
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setPhotoOverride('')}>
                    <Text style={styles.photoRemove}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={pickPhoto}
                style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
                <UploadIcon />
                <Text style={styles.photoLabel}>
                  {photo ? 'Replace current photo' : 'Add current photo'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={publish}
                style={({ pressed }) => [styles.publishButton, (pressed || busy) && styles.pressed]}>
                <SendIcon />
                <Text style={styles.publishLabel}>
                  {editingAlert ? 'Save Changes' : 'Publish Alert'}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.feedList}>
              {activeNearbyAlerts(alerts).map((alert) => (
                <FeedCard
                  key={alert.id}
                  alert={alert}
                  onPress={() =>
                    router.push({ pathname: '/alert-details', params: { id: alert.id } })
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>

        <BottomNav active="alerts" />
      </SafeAreaView>

      {pinOpen ? (
        <PinSheet
          petName={selectedPet?.name ?? editingAlert?.petName ?? ''}
          onSelect={(next) => {
            setLocation(next);
            setPinOpen(false);
          }}
          onClose={() => setPinOpen(false)}
        />
      ) : null}

      {confirmOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>
              {editingAlert ? 'Save lost-pet alert?' : 'Publish lost-pet alert?'}
            </Text>
            <Text style={styles.discardText}>
              {selectedPet?.name ?? editingAlert?.petName ?? 'Your pet'} · last seen near{' '}
              {location?.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmOpen(false)}
              style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
              <Text style={styles.keepLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => [styles.discardButton, (pressed || busy) && styles.pressed]}>
              <Text style={styles.discardLabel}>
                {editingAlert ? 'Save Changes' : 'Publish Alert'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {discardOpen ? (
        <View style={styles.overlay}>
          <View style={styles.discardSheet}>
            <Text style={styles.discardTitle}>Discard report?</Text>
            <Text style={styles.discardText}>Your lost-pet report hasn&apos;t been published.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDiscardOpen(false)}
              style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
              <Text style={styles.keepLabel}>Keep editing</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDiscardOpen(false);
                goBack('/dashboard');
              }}
              style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}>
              <Text style={styles.discardLabel}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.gold,
    borderWidth: 1.5,
    borderColor: Palette.surface,
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.five,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Palette.goldTrack,
    borderRadius: 999,
    padding: 4,
    marginTop: Spacing.four,
  },
  segmentItem: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: Palette.forestDark,
  },
  segmentLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  segmentLabelActive: {
    color: Palette.white,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  input: {
    minHeight: 44,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  inputInvalid: {
    borderColor: Palette.danger,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  placeholderText: {
    color: Palette.placeholder,
  },
  textArea: {
    minHeight: 96,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  dropdown: {
    marginTop: Spacing.two,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  dropdownLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  locationBox: {
    minHeight: 104,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.goldTrack,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
  },
  locationBoxPinned: {
    alignItems: 'stretch',
    borderStyle: 'solid',
    borderColor: Palette.forestDark,
  },
  locationBoxInvalid: {
    borderColor: Palette.danger,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  locationCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationText: {
    flex: 1,
  },
  locationTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  locationHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    padding: Spacing.two,
  },
  photoThumb: {
    borderRadius: 10,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: {
    flex: 1,
  },
  photoName: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
  },
  photoHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  photoRemove: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.danger,
    paddingHorizontal: Spacing.two,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    marginTop: Spacing.four,
  },
  photoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
    shadowColor: '#F2B632',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  publishLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  feedList: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  feedCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    shadowColor: '#1B4332',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  feedPhoto: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  feedPhotoImage: {
    width: '100%',
    height: '100%',
  },
  feedBody: {
    flex: 1,
    gap: 2,
  },
  feedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedName: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  feedPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  feedPillLost: {
    backgroundColor: Palette.goldSoft,
  },
  feedPillFound: {
    backgroundColor: Palette.sage,
  },
  feedPillText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  feedLocation: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    color: Palette.forestDark,
  },
  feedTime: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Palette.inkMuted,
  },
  feedDescription: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    marginTop: 2,
  },
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
  discardSheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  discardTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  discardText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  keepButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  keepLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  discardButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
  },
  discardLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pinSheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '86%',
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
  },
  pinTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  pinHint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  mapPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.sage,
    borderRadius: 14,
    padding: Spacing.four,
    gap: 4,
    marginTop: Spacing.four,
  },
  mapPanelTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  mapPanelHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  pinSectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  pinList: {
    gap: Spacing.two,
  },
  pinOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pinOptionLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  pinOptionArea: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Palette.inkMuted,
  },
  pinCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.two,
  },
  pinCustomLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
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
  confirmWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  confirmTitle: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  confirmText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  confirmButton: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});