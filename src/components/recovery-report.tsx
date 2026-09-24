import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { UploadIcon } from "@/components/app-icons";
import { Palette } from "@/constants/palette";
import { Fonts, Spacing } from "@/constants/theme";
import { createFoundReport } from "@/lib/found-reports";
import { type LostPetAlert } from "@/lib/lost-pets";
import { addNotification } from "@/lib/notifications";
import { type Pet } from "@/lib/pets";

const FINDER_ID = "finder-local-member";

type Props = {
  pet: Pet | null;
  lostAlert: LostPetAlert | null;
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

export function RecoveryReportSheet({
  pet,
  lostAlert,
  visible,
  onClose,
  onSubmitted,
}: Props) {
  const [where, setWhere] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setWhere("");
      setMessage("");
      setPhoto("");
      setError("");
      setSubmitting(false);
    }
  }, [visible]);

  if (!visible || !pet) return null;

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto(
          `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`,
        );
      } else {
        setPhoto(asset.uri);
      }
    } catch {
      // Photo is optional; keep the previous state on failure.
    }
  };

  const submit = async () => {
    if (!where.trim()) {
      setError("Please enter where you found the pet.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const report = await createFoundReport({
        alertId: lostAlert?.id ?? null,
        petId: pet.id,
        petName: pet.name,
        ownerId: lostAlert?.ownerId ?? pet.ownerId,
        finderId: FINDER_ID,
        where: where.trim(),
        message: message.trim(),
        photo,
        status: "OPEN",
      });
      const reportedNear = where.trim()
        ? ` Reported near ${where.trim()}.`
        : "";
      await addNotification({
        id: `ntf-reunite-${report.id}`,
        kind: "reunite",
        title: `${pet.name} may have been found`,
        description: `A Pet-Connect member scanned ${pet.name}'s QR ID and submitted a recovery report.${reportedNear}`,
        timestamp: "Just now",
        route: { pathname: "/found-report", params: { id: report.id } },
      });
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <ScrollView
        contentContainerStyle={styles.sheetScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Help reunite {pet.name}</Text>
          <Text style={styles.sheetHint}>
            Only the owner will see the details you share here.
          </Text>

          <Text style={styles.sheetLabel}>Where did you find {pet.name}?</Text>
          <TextInput
            value={where}
            onChangeText={(value) => {
              setWhere(value);
              if (value.trim()) setError("");
            }}
            placeholder="e.g. Mankilam, Tagum"
            placeholderTextColor={Palette.placeholder}
            style={[styles.sheetInput, error ? styles.sheetInputInvalid : null]}
          />
          {error ? <Text style={styles.sheetError}>{error}</Text> : null}

          <Text style={styles.sheetLabel}>Message to owner</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Optional"
            placeholderTextColor={Palette.placeholder}
            style={[styles.sheetInput, styles.sheetTextArea]}
            multiline
          />

          <Text style={styles.sheetLabel}>Add photo</Text>
          {photo ? (
            <View style={styles.photoPreview}>
              <Image
                source={{ uri: photo }}
                style={styles.photoThumb}
                contentFit="cover"
              />
              <Text style={styles.photoName}>Location photo</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPhoto("")}
              >
                <Text style={styles.photoRemove}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={pickPhoto}
            style={({ pressed }) => [
              styles.photoButton,
              pressed && styles.pressed,
            ]}
          >
            <UploadIcon size={16} />
            <Text style={styles.photoLabel}>
              {photo ? "Replace photo" : "Add photo"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.sendButton,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            <Text style={styles.sendLabel}>Send recovery alert</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(20,40,28,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  sheetScroll: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Palette.cream,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: "stretch",
  },
  sheetTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  sheetHint: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Palette.inkMuted,
    marginTop: 2,
    marginBottom: Spacing.one,
  },
  sheetLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "700",
    color: Palette.forestDark,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  sheetInput: {
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
  sheetInputInvalid: {
    borderColor: Palette.danger,
  },
  sheetTextArea: {
    minHeight: 84,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: "top",
  },
  sheetError: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.danger,
    marginTop: Spacing.one,
  },
  photoPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 12,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  photoThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Palette.sage,
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
    fontWeight: "700",
    color: Palette.danger,
    paddingHorizontal: Spacing.two,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
  },
  photoLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  sendButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    marginTop: Spacing.four,
  },
  sendLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    marginTop: Spacing.two,
  },
  cancelLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
