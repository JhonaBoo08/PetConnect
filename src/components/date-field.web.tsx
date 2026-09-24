import { createElement, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import {
  parseDisplayDate,
  toIsoDate,
  toLongDate,
  toDisplayDate,
} from '@/lib/date';

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

function toDateISO(date: Date | undefined): string {
  return date ? toIsoDate(toDisplayDate(date)) : '';
}

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const parsed = parseDisplayDate(value);
  const displayValue = format === 'long' && parsed ? toLongDate(parsed) : value;

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

      {createElement('input', {
        ref: inputRef,
        type: 'date',
        value: toIsoDate(value),
        min: toDateISO(minimumDate),
        max: toDateISO(maximumDate),
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