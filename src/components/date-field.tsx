import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon } from '@/components/app-icons';
import { Palette } from '@/constants/palette';
import { Fonts, Spacing } from '@/constants/theme';
import { parseDisplayDate, toDisplayDate } from '@/lib/date';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
};

export function DateField({ value, onChange, invalid }: DateFieldProps) {
  const [show, setShow] = useState(false);
  const selected = parseDisplayDate(value) ?? new Date(2020, 0, 1);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select birthdate"
        onPress={() => setShow(true)}
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

      {show ? (
        <DateTimePicker
          value={selected}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
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