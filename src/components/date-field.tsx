import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import { parseDisplayDate, toDisplayDate, toLongDate } from '@/lib/date';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  format?: 'short' | 'long';
  onClear?: () => void;
  accessibilityLabel?: string;
};

export function DateField({
  value,
  onChange,
  invalid,
  placeholder = 'dd/mm/yyyy',
  maximumDate,
  minimumDate,
  format = 'short',
  onClear,
  accessibilityLabel = 'Select birthdate',
}: DateFieldProps) {
  const [show, setShow] = useState(false);
  const parsed = parseDisplayDate(value);
  const selected = parsed ?? (minimumDate && minimumDate > new Date(2020, 0, 1) ? minimumDate : new Date(2020, 0, 1));
  const displayValue = format === 'long' && parsed ? toLongDate(parsed) : value;

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
          {displayValue || placeholder}
        </Text>
        {onClear && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear date"
            onPress={onClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
            <Text style={styles.clearLabel}>&times;</Text>
          </Pressable>
        ) : null}
        <CalendarIcon size={18} color={Palette.forestDark} />
      </Pressable>

      {show ? (
        <DateTimePicker
          value={selected}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(event, picked) => {
            if (Platform.OS === 'android') setShow(false);
            if (event.type === 'set' && picked) {
              onChange(toDisplayDate(picked));
            }
          }}
        />
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
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.one,
  },
  clearLabel: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  pressed: {
    opacity: 0.85,
  },
});