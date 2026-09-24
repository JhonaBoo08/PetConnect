import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, BellIcon, CheckIcon, SendIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { feedbackTypes, submitClinicFeedback } from '@/lib/clinic';
import { goBack } from '@/lib/navigation';

export default function ClinicFeedbackScreen() {
  const router = useRouter();
  const [type, setType] = useState(feedbackTypes[0]);
  const [message, setMessage] = useState('');
  const [typeError, setTypeError] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setTypeError('Please describe what happened before sending.');
      return;
    }
    setTypeError('');
    setSaveError(null);
    setSending(true);
    try {
      await submitClinicFeedback({ type, message: trimmed });
      setSuccess(true);
      setTimeout(() => {
        router.replace('/clinic');
      }, 1200);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Unable to send feedback. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
              onPress={() => goBack('/clinic')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BackArrow />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/clinic-notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <BellIcon />
            </Pressable>
          </View>

          <Text style={styles.category}>CLINIC · SUPPORT</Text>
          <Text style={styles.heading}>Provide feedback</Text>
          <Text style={styles.supporting}>
            Tell us how the clinic workspace is working, or report an issue.
          </Text>

          <Text style={styles.label}>Feedback type</Text>
          <View style={styles.chipRow}>
            {feedbackTypes.map((option) => {
              const active = type === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setType(option)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>How can we help?</Text>
          <TextInput
            value={message}
            onChangeText={(value) => {
              setMessage(value);
              if (value.trim()) setTypeError('');
            }}
            placeholder="Describe the issue or your suggestion..."
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, styles.textArea, typeError ? styles.inputInvalid : null]}
            multiline
          />
          {typeError ? <Text style={styles.error}>{typeError}</Text> : null}
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

          <Pressable
            accessibilityRole="button"
            onPress={submit}
            disabled={sending}
            style={({ pressed }) => [
              styles.submitButton,
              (pressed || sending) && styles.pressed,
            ]}>
            <SendIcon size={18} color={Palette.forestDark} />
            <Text style={styles.submitLabel}>Send feedback</Text>
          </Pressable>
        </ScrollView>

        <BottomNav variant="clinic" active="clinic" />
      </SafeAreaView>

      {success ? (
        <View style={styles.overlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIcon}>
              <CheckIcon size={20} color={Palette.white} />
            </View>
            <Text style={styles.successTitle}>Thank you. Your feedback has been submitted.</Text>
            <Text style={styles.successText}>
              Our team will review your {type.toLowerCase()} feedback.
            </Text>
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
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  supporting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    backgroundColor: Palette.goldTrack,
    borderRadius: 14,
    padding: 4,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Palette.forestDark,
  },
  chipLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.forestDark,
  },
  chipLabelActive: {
    color: Palette.white,
  },
  input: {
    minHeight: 46,
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
  textArea: {
    minHeight: 140,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.two,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 22,
    backgroundColor: Palette.gold,
    marginTop: Spacing.five,
    boxShadow: '0 4px 10px rgba(242, 182, 50, 0.30)',
  },
  submitLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '800',
    color: Palette.forestDark,
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
  successSheet: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  successTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: Palette.forestDark,
    textAlign: 'center',
  },
  successText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});