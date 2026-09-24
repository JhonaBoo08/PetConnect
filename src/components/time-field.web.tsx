import { createElement, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClockIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import { parseTime, timeInputToDisplay, toTimeInput } from '@/lib/date';

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const parsed = parseTime(value);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        input.click();
      }
    } else {
      input.click();
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={openPicker}
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

      {createElement('input', {
        ref: inputRef,
        type: 'time',
        value: parsed ? toTimeInput(parsed) : '',
        onChange: (event) => {
          const next = (event.target as HTMLInputElement).value;
          onChange(next ? timeInputToDisplay(next) : '');
        },
        style: { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
      })}
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
});