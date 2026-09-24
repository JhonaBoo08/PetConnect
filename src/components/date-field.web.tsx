import { createElement, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import { toIsoDate, toDisplayDate } from '@/lib/date';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
};

export function DateField({ value, onChange, invalid }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        accessibilityLabel="Select birthdate"
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          invalid ? styles.fieldInvalid : null,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || 'dd/mm/yyyy'}
        </Text>
        <CalendarIcon size={18} color={Palette.forestDark} />
      </Pressable>

      {createElement('input', {
        ref: inputRef,
        type: 'date',
        value: toIsoDate(value),
        max: toIsoDate(toDisplayDate(new Date())),
        onChange: (event) => {
          const next = (event.target as HTMLInputElement).value;
          onChange(next ? toDisplayDate(new Date(`${next}T00:00:00`)) : '');
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