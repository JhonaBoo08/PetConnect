import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BackArrow,
  CameraIcon,
  CheckIcon,
  PawIcon,
  PhoneIcon,
  PinIcon,
  SendIcon,
  ShieldIcon,
} from "@/components/app-icons";
import { RecoveryMap } from "@/components/recovery-map";
import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { goBack } from "@/lib/navigation";
import { ApiError } from "@/services/auth";
import { authErrorMessage } from "@/services/auth-context";
import { requestCurrentCoordinates } from "@/services/device-recovery";
import {
  ensureFinderSession,
  newFinderIdempotencyKey,
  sendFinderOtp,
  submitFinderReport,
  uploadFinderPhoto,
  verifyFinderOtp,
} from "@/services/finder-recovery";
import { petPhotoUri } from "@/services/pets";
import { getPublicRecovery } from "@/services/recovery";
import type {
  Coordinates,
  FinderEncounterType,
  FinderSubmissionResult,
  PublicRecoveryProfile,
} from "../../../shared/contracts";

type Flow = "PROFILE" | "HAVE_PET" | "SEEN" | "VERIFY" | "SUCCESS";

function recoveryErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    return cause.status >= 500
      ? "Pet recovery is temporarily unavailable. Please try again."
      : cause.message;
  }
  if (cause instanceof TypeError && cause.message.includes("fetch")) {
    return "Could not connect to PetConnect. Check your connection and try again.";
  }
  return authErrorMessage(cause);
}

function encounterCopy(encounter: FinderEncounterType, petName: string) {
  return encounter === "HAVE_PET"
    ? {
        title: `I have ${petName}`,
        subtitle:
          "Tell the owner where the pet is now. A current photo is required for this report.",
        submit: "Send found-pet report",
      }
    : {
        title: `I saw ${petName}`,
        subtitle:
          "Send a quick location update. A photo is helpful but not required.",
        submit: "Send sighting",
      };
}

export default function RecoverScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [profile, setProfile] = useState<PublicRecoveryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow>("PROFILE");
  const [encounterType, setEncounterType] =
    useState<FinderEncounterType>("SEEN");

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationText, setLocationText] = useState("");
  const [locationError, setLocationError] = useState("");
  const [finderName, setFinderName] = useState("");
  const [finderContact, setFinderContact] = useState("");
  const [shareContact, setShareContact] = useState(false);
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(
    newFinderIdempotencyKey(),
  );

  const [photoBusy, setPhotoBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [verificationPhone, setVerificationPhone] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [developmentCode, setDevelopmentCode] = useState("");

  const [submission, setSubmission] = useState<FinderSubmissionResult | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!token) {
      throw new Error("This recovery link is missing its PetConnect token.");
    }
    const result = await getPublicRecovery(token);
    setProfile(result);
    // Finder sessions are intentionally independent from PetConnect accounts.
    // Session setup failure must not block viewing the public recovery profile.
    void ensureFinderSession().catch(() => {});
  }, [token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((cause) => {
        if (active) {
          setProfile(null);
          setError(recoveryErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  function begin(next: FinderEncounterType) {
    setEncounterType(next);
    setFlow(next === "HAVE_PET" ? "HAVE_PET" : "SEEN");
    setError("");
    setLocationError("");
    setSubmission(null);
    setIdempotencyKey(newFinderIdempotencyKey());
  }

  function resetReport() {
    setPhotoUri(null);
    setEvidenceId("");
    setLocation(null);
    setLocationText("");
    setLocationError("");
    setNotes("");
    setOtpChallengeId("");
    setOtpCode("");
    setDevelopmentCode("");
    setError("");
    setSubmission(null);
    setIdempotencyKey(newFinderIdempotencyKey());
    setFlow("PROFILE");
  }

  async function choosePhoto(preferCamera = true) {
    setPhotoBusy(true);
    setError("");
    try {
      let result: ImagePicker.ImagePickerResult;
      if (preferCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.granted) {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.85,
          });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.85,
          });
        }
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.85,
        });
      }
      if (result.canceled) return;
      const next = result.assets[0]?.uri;
      if (!next) throw new Error("The selected photo could not be opened.");
      setPhotoUri(next);
      // A retake is a new piece of evidence. The previous staged upload, if
      // any, is intentionally left to the server's short retention cleanup.
      setEvidenceId("");
    } catch (cause) {
      setError(recoveryErrorMessage(cause));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function locate() {
    setLocationBusy(true);
    setError("");
    setLocationError("");
    try {
      const next = await requestCurrentCoordinates();
      setLocation(next);
    } catch {
      setLocation(null);
      setLocationError(
        "PetConnect could not read your location. You can still type a nearby street, landmark, or area below.",
      );
    } finally {
      setLocationBusy(false);
    }
  }

  async function prepareEvidence(): Promise<string | undefined> {
    if (!photoUri || !token) return undefined;
    if (evidenceId) return evidenceId;
    const uploaded = await uploadFinderPhoto(token, photoUri);
    setEvidenceId(uploaded.id);
    return uploaded.id;
  }

  async function sendReport() {
    if (!token || !profile) return;
    setLocationError("");
    if (encounterType === "HAVE_PET" && !photoUri) {
      setError(
        `Add a current photo of ${profile.pet.name} before sending a found-pet report.`,
      );
      return;
    }
    if (!location && !locationText.trim()) {
      setError(
        "Share your current location or type a nearby landmark so the owner knows where the pet was encountered.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const attachedEvidence = photoUri ? await prepareEvidence() : undefined;
      const result = await submitFinderReport(token, {
        encounterType,
        evidenceId: attachedEvidence,
        finderName: finderName.trim() || undefined,
        finderContact: finderContact.trim() || undefined,
        shareContact: shareContact && Boolean(finderContact.trim()),
        notes: notes.trim() || undefined,
        locationText: locationText.trim() || undefined,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracyM: location?.accuracyM ?? null,
        locationSource: location ? "GPS" : "TEXT",
        idempotencyKey,
      });
      setSubmission(result);
      setFlow("SUCCESS");
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.code === "phone-verification-required"
      ) {
        setFlow("VERIFY");
        setError("");
      } else {
        setError(recoveryErrorMessage(cause));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function requestOtp() {
    if (!verificationPhone.trim()) {
      setError("Enter the phone number you want to verify.");
      return;
    }
    setOtpBusy(true);
    setError("");
    try {
      const result = await sendFinderOtp(verificationPhone);
      setOtpChallengeId(result.challengeId);
      setDevelopmentCode(result.developmentCode || "");
    } catch (cause) {
      setError(recoveryErrorMessage(cause));
    } finally {
      setOtpBusy(false);
    }
  }

  async function confirmOtp() {
    if (!otpChallengeId || !otpCode.trim()) {
      setError("Enter the verification code.");
      return;
    }
    setOtpBusy(true);
    setError("");
    try {
      await verifyFinderOtp(otpChallengeId, otpCode);
      setFlow(encounterType === "HAVE_PET" ? "HAVE_PET" : "SEEN");
      setOtpCode("");
      await sendReport();
    } catch (cause) {
      setError(recoveryErrorMessage(cause));
    } finally {
      setOtpBusy(false);
    }
  }

  const phone = profile?.owner.phone?.trim() || "";
  const active = profile?.activeReport;
  const copy = profile ? encounterCopy(encounterType, profile.pet.name) : null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to scanner"
            onPress={() => goBack("/scan")}
            style={styles.iconButton}
          >
            <BackArrow />
          </Pressable>

          <Text style={styles.category}>PETCONNECT RECOVERY</Text>
          <Text style={styles.heading}>
            {flow === "SUCCESS"
              ? "Report sent"
              : flow === "VERIFY"
                ? "Verify your phone"
                : "Help this pet get home"}
          </Text>

          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading recovery profile"
              color={Palette.forestDark}
              style={styles.loading}
            />
          ) : null}

          {!loading && !profile ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                Recovery profile unavailable
              </Text>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error || "This recovery link is unavailable."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => goBack("/scan")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Scan another QR</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && profile ? (
            <>
              <View style={styles.petCard}>
                <View style={styles.photo}>
                  {profile.pet.photoUrl ? (
                    <Image
                      source={{ uri: petPhotoUri(profile.pet.photoUrl) || "" }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityLabel={`${profile.pet.name} photo`}
                    />
                  ) : (
                    <PawIcon size={54} color={Palette.forestDark} />
                  )}
                </View>
                <View style={styles.petBody}>
                  <View style={styles.petTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.petName}>{profile.pet.name}</Text>
                      <Text style={styles.petMeta}>
                        {[
                          profile.pet.breed || profile.pet.species,
                          profile.pet.sex,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        active ? styles.statusLost : styles.statusRegistered,
                      ]}
                    >
                      <Text style={styles.statusPillText}>
                        {active ? "LOST PET" : "REGISTERED PET"}
                      </Text>
                    </View>
                  </View>
                  {profile.pet.identifyingDetails ? (
                    <View style={styles.identifyingBox}>
                      <Text style={styles.darkLabel}>IDENTIFYING DETAILS</Text>
                      <Text style={styles.identifyingText}>
                        {profile.pet.identifyingDetails}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {flow === "PROFILE" ? (
                <>
                  {active ? (
                    <View style={styles.alertCard}>
                      <Text style={styles.alertTitle}>
                        {profile.pet.name} was reported missing
                      </Text>
                      <Text style={styles.alertLocation}>
                        Last known: {active.lastSeenText}
                      </Text>
                      {active.details ? (
                        <Text style={styles.muted}>{active.details}</Text>
                      ) : null}
                      <RecoveryMap
                        pins={[
                          {
                            id: "last-known",
                            latitude: active.latitude,
                            longitude: active.longitude,
                            title: `${profile.pet.name} · last known`,
                            description:
                              active.status === "SIGHTED"
                                ? "Latest finder sighting"
                                : "Owner's last-seen area",
                            status: active.status,
                          },
                        ]}
                        selected={null}
                        height={210}
                      />
                      <Text style={styles.privacyHint}>
                        The map follows the owner's public-location privacy
                        setting and may intentionally show an approximate area.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoTitle}>
                        This Pet ID is active
                      </Text>
                      <Text style={styles.muted}>
                        The owner has not marked {profile.pet.name} as lost. If
                        you found this pet away from the owner, you can still
                        send a private alert.
                      </Text>
                    </View>
                  )}

                  <View style={styles.choiceCard}>
                    <Text style={styles.sectionTitle}>
                      {active
                        ? `How did you encounter ${profile.pet.name}?`
                        : `Did you find ${profile.pet.name}?`}
                    </Text>
                    {active ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="I have this pet"
                          onPress={() => begin("HAVE_PET")}
                          style={styles.primaryChoice}
                        >
                          <PawIcon size={23} color={Palette.white} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.primaryChoiceTitle}>
                              I have this pet
                            </Text>
                            <Text style={styles.primaryChoiceMeta}>
                              The pet is currently with me
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="I saw this pet"
                          onPress={() => begin("SEEN")}
                          style={styles.secondaryChoice}
                        >
                          <PinIcon size={22} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.secondaryChoiceTitle}>
                              I saw this pet
                            </Text>
                            <Text style={styles.secondaryChoiceMeta}>
                              I spotted the pet but do not have them
                            </Text>
                          </View>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="I found this pet"
                        onPress={() => begin("HAVE_PET")}
                        style={styles.primaryChoice}
                      >
                        <PawIcon size={23} color={Palette.white} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.primaryChoiceTitle}>
                            I found this pet
                          </Text>
                          <Text style={styles.primaryChoiceMeta}>
                            Privately alert the registered owner
                          </Text>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {phone ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Call pet owner"
                      onPress={() => void Linking.openURL("tel:" + phone)}
                      style={styles.callButton}
                    >
                      <PhoneIcon />
                      <Text style={styles.callButtonText}>Call pet owner</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.privacyCard}>
                    <ShieldIcon size={22} />
                    <Text style={styles.privacyText}>
                      No PetConnect account or app is required. This recovery
                      page excludes the owner's email, account identity, health
                      records, appointments, and internal database IDs.
                    </Text>
                  </View>
                </>
              ) : null}

              {flow === "HAVE_PET" || flow === "SEEN" ? (
                <View style={styles.flowCard}>
                  <Text style={styles.sectionTitle}>{copy?.title}</Text>
                  <Text style={styles.muted}>{copy?.subtitle}</Text>

                  <Text style={styles.stepLabel}>
                    {encounterType === "HAVE_PET"
                      ? "1 · CURRENT PET PHOTO — REQUIRED"
                      : "PHOTO — OPTIONAL"}
                  </Text>
                  {photoUri ? (
                    <View style={styles.evidencePreview}>
                      <Image
                        source={{ uri: photoUri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                      <View style={styles.previewActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void choosePhoto(true)}
                          style={styles.previewAction}
                        >
                          <Text style={styles.previewActionText}>Retake</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void choosePhoto(false)}
                          style={styles.previewAction}
                        >
                          <Text style={styles.previewActionText}>Choose</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        encounterType === "HAVE_PET"
                          ? "Take a current photo"
                          : "Add a photo"
                      }
                      disabled={photoBusy}
                      onPress={() => void choosePhoto(true)}
                      style={styles.cameraButton}
                    >
                      {photoBusy ? (
                        <ActivityIndicator color={Palette.forestDark} />
                      ) : (
                        <>
                          <CameraIcon size={30} color={Palette.forestDark} />
                          <Text style={styles.cameraTitle}>
                            {encounterType === "HAVE_PET"
                              ? "Take a current photo"
                              : "Add a photo"}
                          </Text>
                          <Text style={styles.cameraMeta}>
                            Camera is preferred; your browser may also allow an
                            existing photo.
                          </Text>
                        </>
                      )}
                    </Pressable>
                  )}

                  <Text style={styles.stepLabel}>
                    {encounterType === "HAVE_PET"
                      ? "2 · WHERE ARE YOU NOW?"
                      : "WHERE DID YOU SEE THE PET?"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      location ? "Refresh current GPS" : "Use my current GPS"
                    }
                    disabled={locationBusy}
                    onPress={() => void locate()}
                    style={styles.locationButton}
                  >
                    {locationBusy ? (
                      <ActivityIndicator color={Palette.forestDark} />
                    ) : (
                      <>
                        <PinIcon size={19} />
                        <Text style={styles.locationButtonText}>
                          {location
                            ? "Refresh current GPS"
                            : "Use my current GPS"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {location ? (
                    <View style={styles.locationResult}>
                      <CheckIcon size={15} color={Palette.forestDark} />
                      <Text style={styles.locationResultText}>
                        Location attached
                        {location.accuracyM
                          ? ` · about ±${Math.round(location.accuracyM)} m`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                  {locationError ? (
                    <Text accessibilityRole="alert" style={styles.inlineError}>
                      {locationError}
                    </Text>
                  ) : null}
                  <Text style={styles.fieldLabel}>
                    Nearby street, landmark, or area
                  </Text>
                  <TextInput
                    accessibilityLabel="Finder location description"
                    value={locationText}
                    onChangeText={(value) => {
                      setLocationText(value);
                      setLocationError("");
                    }}
                    placeholder="e.g. Near Freedom Park, Tagum"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                  <Text style={styles.privacyHint}>
                    Exact GPS, when shared, is sent privately to the owner.
                    Public lost-pet maps still follow the owner's location
                    privacy setting.
                  </Text>

                  <Text style={styles.stepLabel}>
                    {encounterType === "HAVE_PET"
                      ? "3 · OPTIONAL DETAILS"
                      : "OPTIONAL DETAILS"}
                  </Text>
                  <TextInput
                    accessibilityLabel="Finder name"
                    value={finderName}
                    onChangeText={setFinderName}
                    placeholder="Your name (optional)"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                  />
                  <TextInput
                    accessibilityLabel="Finder contact"
                    value={finderContact}
                    onChangeText={setFinderContact}
                    placeholder="Phone or messaging contact (optional)"
                    placeholderTextColor={Palette.placeholder}
                    style={styles.input}
                    keyboardType="phone-pad"
                  />
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Share my contact details with the pet owner"
                    accessibilityState={{ checked: shareContact }}
                    onPress={() => setShareContact((value) => !value)}
                    style={styles.checkRow}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        shareContact && styles.checkboxChecked,
                      ]}
                    >
                      {shareContact ? (
                        <CheckIcon size={13} color={Palette.white} />
                      ) : null}
                    </View>
                    <Text style={styles.checkText}>
                      Share my contact details with the pet owner
                    </Text>
                  </Pressable>
                  <TextInput
                    accessibilityLabel="Finder notes"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={
                      encounterType === "HAVE_PET"
                        ? "Condition, safe pickup details, or anything the owner should know"
                        : "Direction, condition, behavior, or other useful detail"
                    }
                    placeholderTextColor={Palette.placeholder}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />

                  {error ? (
                    <Text accessibilityRole="alert" style={styles.inlineError}>
                      {error}
                    </Text>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy?.submit || "Send finder report"}
                    disabled={submitting || photoBusy}
                    onPress={() => void sendReport()}
                    style={styles.submitButton}
                  >
                    {submitting ? (
                      <ActivityIndicator color={Palette.white} />
                    ) : (
                      <>
                        <SendIcon color={Palette.white} />
                        <Text style={styles.submitButtonText}>
                          {copy?.submit}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFlow("PROFILE")}
                    style={styles.textButton}
                  >
                    <Text style={styles.textButtonText}>Back</Text>
                  </Pressable>
                </View>
              ) : null}

              {flow === "VERIFY" ? (
                <View style={styles.flowCard}>
                  <ShieldIcon size={26} />
                  <Text style={styles.sectionTitle}>
                    Extra verification needed
                  </Text>
                  <Text style={styles.muted}>
                    PetConnect detected unusually frequent finder activity from
                    this anonymous session. Verify a phone number to continue.
                    Verification does not automatically share your number with
                    the pet owner.
                  </Text>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <TextInput
                    accessibilityLabel="Verification phone number"
                    value={verificationPhone}
                    onChangeText={setVerificationPhone}
                    placeholder="+63 9XX XXX XXXX"
                    placeholderTextColor={Palette.placeholder}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                  {!otpChallengeId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Send verification code"
                      disabled={otpBusy}
                      onPress={() => void requestOtp()}
                      style={styles.submitButton}
                    >
                      {otpBusy ? (
                        <ActivityIndicator color={Palette.white} />
                      ) : (
                        <Text style={styles.submitButtonText}>
                          Send verification code
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>6-digit code</Text>
                      <TextInput
                        accessibilityLabel="Verification code"
                        value={otpCode}
                        onChangeText={setOtpCode}
                        placeholder="000000"
                        placeholderTextColor={Palette.placeholder}
                        keyboardType="number-pad"
                        maxLength={6}
                        style={styles.input}
                      />
                      {developmentCode ? (
                        <Text style={styles.devHint}>
                          Local development code: {developmentCode}
                        </Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Verify and send report"
                        disabled={otpBusy}
                        onPress={() => void confirmOtp()}
                        style={styles.submitButton}
                      >
                        {otpBusy ? (
                          <ActivityIndicator color={Palette.white} />
                        ) : (
                          <Text style={styles.submitButtonText}>
                            Verify and send report
                          </Text>
                        )}
                      </Pressable>
                    </>
                  )}
                  {error ? (
                    <Text accessibilityRole="alert" style={styles.inlineError}>
                      {error}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setFlow(
                        encounterType === "HAVE_PET" ? "HAVE_PET" : "SEEN",
                      )
                    }
                    style={styles.textButton}
                  >
                    <Text style={styles.textButtonText}>Back to report</Text>
                  </Pressable>
                </View>
              ) : null}

              {flow === "SUCCESS" && submission ? (
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <CheckIcon size={28} color={Palette.white} />
                  </View>
                  <Text style={styles.successTitle}>
                    {encounterType === "HAVE_PET"
                      ? "Found-pet report sent"
                      : "Sighting sent"}
                  </Text>
                  <Text style={styles.successText}>
                    Your report was saved in PetConnect and added to the owner's
                    recovery updates. Push delivery depends on the owner's
                    notification settings and device connectivity.
                  </Text>
                  <View style={styles.receipt}>
                    <Text style={styles.receiptLabel}>REPORT REFERENCE</Text>
                    <Text style={styles.receiptValue}>
                      {submission.kind === "SIGHTING"
                        ? submission.sighting.id
                        : submission.event.id}
                    </Text>
                    <Text style={styles.receiptMeta}>
                      {photoUri ? "Photo attached · " : ""}
                      {location ? "GPS shared · " : "Landmark shared · "}
                      {new Date().toLocaleString()}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetReport}
                    style={styles.submitButton}
                  >
                    <Text style={styles.submitButtonText}>
                      Return to recovery profile
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSubmission(null);
                      setPhotoUri(null);
                      setEvidenceId("");
                      setNotes("");
                      setIdempotencyKey(newFinderIdempotencyKey());
                      setFlow(
                        encounterType === "HAVE_PET" ? "HAVE_PET" : "SEEN",
                      );
                    }}
                    style={styles.textButton}
                  >
                    <Text style={styles.textButtonText}>
                      Submit another update
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  category: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  loading: {
    marginTop: Spacing.five,
  },
  petCard: {
    marginTop: Spacing.four,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: Palette.forestDark,
  },
  photo: {
    width: "100%",
    height: 225,
    backgroundColor: Palette.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  petBody: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  petTitleRow: {
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  petName: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: "800",
    color: Palette.white,
  },
  petMeta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: "#C9DBC6",
    marginTop: 3,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  statusLost: {
    backgroundColor: Palette.gold,
  },
  statusRegistered: {
    backgroundColor: Palette.sage,
  },
  statusPillText: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    letterSpacing: 0.7,
    fontWeight: "900",
    color: Palette.forestDark,
  },
  identifyingBox: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 13,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  darkLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#C9DBC6",
  },
  identifyingText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.white,
  },
  alertCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.goldTrack,
    gap: Spacing.two,
  },
  alertTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "900",
    color: Palette.forestDark,
  },
  alertLocation: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  infoCard: {
    marginTop: Spacing.four,
    padding: Spacing.four,
    borderRadius: 18,
    backgroundColor: Palette.sage,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
  },
  infoTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  muted: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  choiceCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  primaryChoice: {
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  primaryChoiceTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.white,
  },
  primaryChoiceMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: "#C9DBC6",
    marginTop: 2,
  },
  secondaryChoice: {
    minHeight: 70,
    borderRadius: 16,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  secondaryChoiceTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  secondaryChoiceMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Palette.inkMuted,
    marginTop: 2,
  },
  callButton: {
    minHeight: 48,
    marginTop: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  callButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  privacyCard: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    alignItems: "flex-start",
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.inkMuted,
  },
  privacyHint: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    color: Palette.inkMuted,
  },
  flowCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    gap: Spacing.two,
  },
  stepLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
    color: Palette.forestDark,
    marginTop: Spacing.three,
  },
  cameraButton: {
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Palette.border,
    backgroundColor: Palette.cream,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    padding: Spacing.three,
  },
  cameraTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  cameraMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: "center",
    color: Palette.inkMuted,
  },
  evidencePreview: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Palette.sage,
    justifyContent: "flex-end",
  },
  previewActions: {
    flexDirection: "row",
    gap: Spacing.two,
    padding: Spacing.two,
    backgroundColor: "rgba(27,67,50,0.72)",
  },
  previewAction: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  previewActionText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  locationButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Palette.sage,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  locationButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  locationResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: 10,
    backgroundColor: Palette.sage,
  },
  locationResultText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: Palette.forestDark,
  },
  fieldLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: "800",
    color: Palette.forestDark,
    marginTop: Spacing.one,
  },
  input: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.cream,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Palette.forestDark,
  },
  textArea: {
    minHeight: 96,
    paddingTop: Spacing.three,
    textAlignVertical: "top",
  },
  checkRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.cream,
  },
  checkboxChecked: {
    backgroundColor: Palette.forestDark,
    borderColor: Palette.forestDark,
  },
  checkText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Palette.forestDark,
  },
  submitButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: Palette.forestDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  submitButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.white,
  },
  textButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  inlineError: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: Palette.danger,
    backgroundColor: "#FBEDEA",
    borderRadius: 10,
    padding: Spacing.two,
  },
  devHint: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Palette.inkMuted,
    backgroundColor: Palette.cream,
    borderRadius: 8,
    padding: Spacing.two,
  },
  successCard: {
    marginTop: Spacing.four,
    padding: Spacing.four,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    alignItems: "center",
  },
  successIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Palette.forestDark,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: Fonts.sans,
    fontSize: 21,
    fontWeight: "900",
    color: Palette.forestDark,
    marginTop: Spacing.three,
  },
  successText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  receipt: {
    width: "100%",
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Palette.sage,
  },
  receiptLabel: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
    color: Palette.inkMuted,
  },
  receiptValue: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Palette.forestDark,
    marginTop: 5,
  },
  receiptMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    color: Palette.inkMuted,
    marginTop: Spacing.one,
  },
  errorCard: {
    marginTop: Spacing.five,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    padding: Spacing.four,
  },
  errorTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: "800",
    color: Palette.forestDark,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.four,
  },
  secondaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "800",
    color: Palette.forestDark,
  },
});
