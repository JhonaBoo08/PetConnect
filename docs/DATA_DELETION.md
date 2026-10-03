# Account and data deletion procedure

**Status:** operator template. Replace bracketed fields before public launch.

Users may request deletion or correction of their PetConnect account and associated data by contacting:

- **Operator:** [LEGAL/ORGANIZATION NAME]
- **Privacy/deletion contact:** [EMAIL OR SUPPORT CHANNEL]
- **Expected response window:** [NUMBER OF DAYS]

## Request handling

1. Record the request without copying unnecessary sensitive data into tickets or chat.
2. Verify the requester controls the PetConnect/Firebase account or otherwise establish identity using an operator-approved process.
3. Identify data belonging to the account: profile, pets, pet photos, recovery tokens, lost reports/sightings where applicable, notifications, push-device registrations, reminders, appointments, and health/clinic records governed by the service's authorization/retention rules.
4. Explain any records that cannot immediately be deleted because of a legal, fraud/security, veterinary-record, or other legitimate retention obligation.
5. Revoke public recovery tokens and device push registrations when the account is closed.
6. Delete or anonymize eligible database records and managed uploaded files.
7. Disable/delete the associated Firebase Authentication identity when appropriate.
8. Confirm completion without exposing protected internal identifiers or other users' data.
9. Ensure normal backup-retention rotation eventually removes deleted data from backup copies, unless a lawful hold requires retention.

## Operator notes

Before launch, define and document:

- the actual in-product account deletion flow, if provided;
- retention periods for active/reunited recovery reports and clinic records;
- backup retention and deletion propagation;
- identity-verification method;
- any legally mandatory veterinary/financial/security retention;
- escalation contact for privacy complaints.

Do not ask users to send passwords, Firebase tokens, government IDs, or secrets through ordinary email unless a reviewed process specifically requires and protects that information.
