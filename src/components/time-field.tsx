import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClockIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import { formatTime, parseTime } from '@/lib/date';

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
};

export function TimeField({
  value,
  onChange,
  invalid,
  placeholder = 'hh:mm AM',
  accessibilityLabel = 'Select time',
}: TimeFieldProps) {
  const [show, setShow] = useState(false);
  const parsed = parseTime(value);
  const selected = parsed ?? new Date();

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setShow(true)}
        style={({ pressed }) => [
          styles.field,
          invalid ? styles.fieldInvalid : null,
          pressed && styles.pressed,
        ]}>
        <Text numberOfLines={1} style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <ClockIcon size={18} color={Palette.forestDark} />
      </Pressable>

      {show ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={selected}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, picked) => {
              if (Platform.OS === 'android') setShow(false);
              if (event.type === 'set' && picked) {
                onChange(formatTime(picked));
              }
            }}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setShow(false)}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 44,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  fieldInvalid: {
    borderColor: Palette.danger,
  },
  value: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Palette.forestDark,
  },
  placeholder: {
    color: Palette.placeholder,
  },
  pressed: {
    opacity: 0.85,
  },
  pickerWrap: {
    alignItems: 'flex-end',
  },
  doneButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  doneLabel: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: Palette.forestDark,
  },
});