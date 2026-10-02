import type { CSSProperties } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import {
  dateInputValue,
  inputDateKey,
  inputTime24,
  localDateKey,
  timeInputValue,
} from "@/lib/care-calendar";
import type { CareDateTimeFieldsProps } from "./care-date-time-fields";

export function CareDateTimeFields(props: CareDateTimeFieldsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <input
          aria-label="Date"
          type="date"
          value={inputDateKey(props.dateValue)}
          min={localDateKey(new Date())}
          disabled={props.disabled}
          onChange={(event) =>
            props.onDateChange(
              event.currentTarget.value
                ? dateInputValue(event.currentTarget.value)
                : "",
            )
          }
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Time</Text>
        <input
          aria-label="Time"
          type="time"
          value={inputTime24(props.timeValue)}
          step={60}
          disabled={props.disabled}
          onChange={(event) =>
            props.onTimeChange(timeInputValue(event.currentTarget.value))
          }
          style={inputStyle}
        />
      </View>
    </View>
  );
}

const inputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  height: 44,
  padding: "0 12px",
  fontFamily: Fonts.sans,
  fontSize: 14,
  color: "#242218",
  border: "1px solid #E5DCCB",
  borderRadius: 12,
  background: "#FCF9F1",
  colorScheme: "light",
};
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  field: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#242218",
    marginBottom: 7,
  },
});
