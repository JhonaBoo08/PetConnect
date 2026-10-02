import { StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { CalendarIcon } from "@/components/app-icons";
import { Fonts } from "@/constants/theme";

export type CareDateTimeFieldsProps = {
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
};

export function CareDateTimeFields(props: CareDateTimeFieldsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <View>
          <TextInput
            accessibilityLabel="Date"
            value={props.dateValue}
            onChangeText={props.onDateChange}
            placeholder="MM/DD/YYYY"
            maxLength={10}
            editable={!props.disabled}
            style={styles.input}
          />
          <View pointerEvents="none" style={styles.icon}>
            <CalendarIcon size={16} color="#242218" />
          </View>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Time</Text>
        <View>
          <TextInput
            accessibilityLabel="Time"
            value={props.timeValue}
            onChangeText={props.onTimeChange}
            placeholder="09:00 AM"
            maxLength={8}
            editable={!props.disabled}
            style={styles.input}
          />
          <View pointerEvents="none" style={styles.icon}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Circle
                cx={12}
                cy={12}
                r={8}
                stroke="#242218"
                strokeWidth={1.8}
              />
              <Path
                d="M12 7v5l3 2"
                stroke="#242218"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </Svg>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  field: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#242218",
    marginBottom: 7,
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: "#242218",
    height: 44,
    paddingHorizontal: 12,
    paddingRight: 32,
    borderWidth: 1,
    borderColor: "#E5DCCB",
    borderRadius: 12,
    backgroundColor: "#FCF9F1",
  },
  icon: { position: "absolute", right: 12, top: 14 },
});
