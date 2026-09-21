import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { goBack } from '@/lib/navigation';

const petOptions = ['Bantay', 'Mingming'];

type Report = {
  name: string;
  status: 'Lost' | 'Found';
  location: string;
  time: string;
  description: string;
  distance: string;
};

const nearbyReports: Report[] = [
  {
    name: 'Mingming',
    status: 'Lost',
    location: 'Near Apokon',
    time: 'Reported 2 hours ago',
    description: 'Orange tabby with blue collar',
    distance: '1.2 km away',
  },
  {
    name: 'Unnamed pup',
    status: 'Found',
    location: 'Near Freedom Park',
    time: 'Reported 5 hours ago',
    description: 'Brown aspin with red collar, friendly',
    distance: '2.4 km away',
  },
  {
    name: 'Coco',
    status: 'Lost',
    location: 'Near Magugpo East',
    time: 'Reported yesterday',
    description: 'White shih tzu, pink leash',
    distance: '3.1 km away',
  },
];

function FeedCard({ report }: { report: Report }) {
  const isLost = report.status === 'Lost';
  return (
    <View style={styles.feedCard}>
      <View style={styles.feedPhoto}>
        <PawIcon size={26} color={Palette.forestDark} />
      </View>
      <View style={styles.feedBody}>
        <View style={styles.feedTopRow}>
          <Text style={styles.feedName}>{report.name}</Text>
          <View style={[styles.feedPill, isLost ? styles.feedPillLost : styles.feedPillFound]}>
            <Text style={styles.feedPillText}>{report.status}</Text>
          </View>
        </View>
        <Text style={styles.feedLocation}>
          {report.location} · {report.distance}
        </Text>
        <Text style={styles.feedTime}>{report.time}</Text>
        <Text style={styles.feedDescription}>{report.description}</Text>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'report' | 'feed'>('report');
  const [petOpen, setPetOpen] = useState(false);
  const [pet, setPet] = useState('Bantay');
  const [lastSeen, setLastSeen] = useState('');
  const [pinned, setPinned] = useState(false);
  const [details, setDetails] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [errors, setErrors] = useState<{ pet?: string; lastSeen?: string; pin?: string }>({});
  const [published, setPublished] = useState(false);

  const publish = () => {
    const next: typeof errors = {};
    if (!pet) next.pet = 'Please select a pet.';
    if (!lastSeen.trim()) next.lastSeen = 'Please provide where your pet was last seen.';
    if (!pinned) next.pin = 'Please pin the last known location.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      setPublished(true);
    }
  };

  if (published) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.confirmWrap}>
            <View style={styles.confirmIcon}>
              <CheckIcon size={28} color={Palette.white} />
            </View>
            <Text style={styles.confirmTitle}>Lost pet alert published</Text>
            <Text style={styles.confirmText}>
              Nearby Pet-Connect members and clinics can now see your report.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPublished(false);
                setMode('feed');
              }}
              style={({ pressed }) => [styles.publishButton, styles.confirmButton, pressed && styles.pressed]}>
              <Text style={styles.publishLabel}>View my alert</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/dashboard')}
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
              onPress={() => goBack('/dashboard')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
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
              <Pressable
                accessibilityRole="button"
                onPress={() => setPetOpen((open) => !open)}
                style={[styles.input, styles.fieldRow]}>
                <Text style={styles.inputText}>{pet || 'Select a pet'}</Text>
                <ChevronDownIcon />
              </Pressable>
              {petOpen ? (
                <View style={styles.dropdown}>
                  {petOptions.map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      onPress={() => {
                        setPet(option);
                        setPetOpen(false);
                        setErrors((prev) => ({ ...prev, pet: undefined }));
                      }}
                      style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}>
                      <PawIcon size={18} color={Palette.forestDark} />
                      <Text style={styles.dropdownLabel}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {errors.pet ? <Text style={styles.error}>{errors.pet}</Text> : null}

              <Text style={styles.label}>Last seen</Text>
              <TextInput
                value={lastSeen}
                onChangeText={(value) => {
                  setLastSeen(value);
                  if (value.trim()) setErrors((prev) => ({ ...prev, lastSeen: undefined }));
                }}
                placeholder="e.g. Freedom Park, Tagum"
                placeholderTextColor={Palette.placeholder}
                style={styles.input}
              />
              {errors.lastSeen ? <Text style={styles.error}>{errors.lastSeen}</Text> : null}

              <Text style={styles.label}>Pin exact location</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPinned(true);
                  setErrors((prev) => ({ ...prev, pin: undefined }));
                }}
                style={[styles.locationBox, pinned && styles.locationBoxPinned]}>
                {pinned ? (
                  <View style={styles.locationRow}>
                    <View style={styles.locationCheck}>
                      <CheckIcon size={14} color={Palette.white} />
                    </View>
                    <View style={styles.locationText}>
                      <Text style={styles.locationTitle}>Pinned · Freedom Park, Tagum</Text>
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

              {photoAdded ? (
                <View style={styles.photoPreview}>
                  <View style={styles.photoThumb}>
                    <PawIcon size={22} color={Palette.forestDark} />
                  </View>
                  <Text style={styles.photoName}>current_photo.jpg</Text>
                  <Pressable accessibilityRole="button" onPress={() => setPhotoAdded(false)}>
                    <Text style={styles.photoRemove}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setPhotoAdded(true)}
                style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
                <UploadIcon />
                <Text style={styles.photoLabel}>
                  {photoAdded ? 'Replace current photo' : 'Add current photo'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={publish}
                style={({ pressed }) => [styles.publishButton, pressed && styles.pressed]}>
                <SendIcon />
                <Text style={styles.publishLabel}>Publish Alert</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.feedList}>
              {nearbyReports.map((report) => (
                <FeedCard key={report.name} report={report} />
              ))}
            </View>
          )}
        </ScrollView>

        <BottomNav active="alerts" />
      </SafeAreaView>
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
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoName: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Palette.forestDark,
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
