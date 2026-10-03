# Privacy Policy template

**Status:** operator template. Replace every bracketed field and obtain appropriate legal review for the jurisdiction in which PetConnect will operate before publishing.

**Effective date:** [DATE]  
**Operator:** [LEGAL/ORGANIZATION NAME]  
**Privacy contact:** [EMAIL OR CONTACT CHANNEL]

## Information PetConnect processes

PetConnect may process account identity information, owner-selected contact information, pet profile and identification information, pet photos, lost/recovery reports, finder-submitted sightings, foreground location supplied during recovery workflows, notifications, appointments, and veterinary/health records.

Firebase Authentication processes authentication identity and credentials. PetConnect's application API stores application records in MySQL and pet-photo files in the configured upload storage.

## How information is used

Information is used to authenticate accounts, manage pet profiles and Pet IDs, help recover lost pets, deliver owner/clinic notifications, manage pet health/reminder/appointment workflows, secure the service, diagnose failures, and meet lawful operational obligations.

PetConnect does not require continuous background location tracking. Recovery location is collected when a user deliberately invokes a location-enabled recovery action.

## Public recovery data

A valid PetConnect recovery QR/token may expose a limited recovery-safe pet profile without sign-in. The public response is designed not to expose Firebase UID, internal account identifiers, private health/clinic records, authentication claims, account email, hidden address/notes, or contact/location fields the owner has disabled through privacy settings.

Owners can rotate or revoke a Pet ID recovery token. Old/revoked tokens stop resolving to a valid public profile.

## Clinic access

Clinic access requires an authenticated clinic account and follows PetConnect's clinic/pet authorization and appointment relationship rules. Scanning a Pet ID identifies the pet; it does not by itself create unrestricted permanent access to all clinical data.

## Sharing and service providers

The operator may use infrastructure providers needed to run the service, such as Firebase Authentication, server/database hosting, domain/DNS/TLS providers, and Expo push services when enabled. The operator must list the actual production providers here before launch: [PROVIDER LIST].

PetConnect should not sell personal information. If the operator's actual business model changes this, this policy must be updated before such processing occurs.

## Retention and deletion

The operator should retain data only as long as needed for the service, security, legal requirements, or legitimate recovery/medical record obligations. Account/data deletion requests follow [DATA_DELETION.md](DATA_DELETION.md). The operator must define production retention periods before launch: [RETENTION SCHEDULE].

## Security

PetConnect uses authenticated API access, owner/role scoping, signed revocable recovery tokens, privacy filtering, image validation/re-encoding, production configuration validation, and restricted server-side secrets. No system can guarantee absolute security.

## Children's data

The operator must determine whether children/minors may use the deployed service and add the legally required parental/guardian and age-handling terms for the launch jurisdiction: [MINOR-USE POLICY].

## Rights and requests

Depending on applicable law, users may have rights to access, correct, delete, object to, or obtain a copy of personal information. Requests should be sent to [PRIVACY CONTACT]. The operator must verify request identity before disclosing or deleting protected records.

## Changes

Material changes should be published with an updated effective date and, where legally required, notice to affected users.
